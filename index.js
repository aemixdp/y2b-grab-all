var CLIENT_ID = "660364874627-p3i20auept4737fae3eft7dj97i8s7bq.apps.googleusercontent.com";
var API_KEY = "AIzaSyBu3rzz8M_mZSpz_7xPP8SDTxN2yFAe-t4";
var SCOPES = "https://www.googleapis.com/auth/youtube";
var MAX_PLAYLIST_SIZE = 200;

var loadClient;
var videosProcessedElem;
var totalVideosElem;
var usernameOrChannelElem;
var playlistElem;

function DeferredQueue () {}

DeferredQueue.prototype.defer = function (thunk) {
    this.deferred = this.deferred
        ? this.deferred.then(thunk)
        : thunk();
};

function forRange (start, end, fn) {
    for (var i = start; i < end; ++i) {
        fn(i);
    }
}

function clientLoader () {
    var deferred = $.Deferred();
    gapi.client.load("youtube", "v3", function() {
        deferred.resolve();
    });
    return deferred;
}

function checkAuth () {
    gapi.auth.authorize({
        client_id: CLIENT_ID,
        scope: SCOPES,
        immediate: true
    }, handleAuthResult);
}

function handleAuthResult (authResult) {
    if (authResult && !authResult.error) {
        $("#authorize").prop("disabled", true);
        $("#usernameOrChannel, #playlist, #grab").prop("disabled", false);
    } else {
        $("#authorize")
            .prop("disabled", false)
            .click(handleAuthClick);
        $("#usernameOrChannel, #playlist, #grab").prop("disabled", true);
    }
}

function handleAuthClick (event) {
    gapi.auth.authorize({
        client_id: CLIENT_ID,
        scope: SCOPES,
        immediate: false
    }, handleAuthResult);
    return false;
}

function getUploadsChannel (username, channelId) {
    var deferred = $.Deferred();
    gapi.client.youtube.channels.list({
        part: "contentDetails",
        forUsername: username,
        id: channelId
    }).execute(function (response) {
        if (!response.result) {
            deferred.reject("Can't retrieve uploads channel!");
        } else {
            var items = response.result.items;
            for (var i = 0; i < items.length; ++i) {
                var uploadsChannelId = items[i].contentDetails.relatedPlaylists.uploads;
                if (uploadsChannelId) {
                    deferred.resolve(uploadsChannelId);
                    return;
                }
            }
            deferred.reject("Uploads channel not found!");
        }
        response.result.items
    });
    return deferred;
}

function getVideos (playlistId, pageToken) {
    var deferred = $.Deferred();
    gapi.client.youtube.playlistItems.list({
        part: "contentDetails",
        playlistId: playlistId,
        maxResults: 50,
        pageToken: pageToken
    }).execute(function (response) {
        if (!response.result) {
            deferred.reject("Can't retrieve playlist videos!");
        } else {
            var videos = response.result.items.map(function (item) {
                return item.contentDetails;
            });
            if (response.result.nextPageToken) {
                getVideos(playlistId, response.result.nextPageToken)
                    .then(function (restVideos) {
                        deferred.resolve(videos.concat(restVideos));
                    });
            } else {
                deferred.resolve(videos);
            }
        }
    });
    return deferred;
}

function createPlaylist (title) {
    var deferred = $.Deferred();
    gapi.client.youtube.playlists.insert({
        part: 'snippet,status',
        resource: {
            snippet: { title: title } ,
            status: {
                privacyStatus: 'public'
            }
        }
    }).execute(function (response) {
        if (response.result) {
            deferred.resolve(response.result.id);
        } else {
            deferred.reject("Can't create playlist!");
        }
    });
    return deferred;
}

function insertVideo (playlistId, video) {
    video.kind = "youtube#video";
    var deferred = $.Deferred();
    gapi.client.youtube.playlistItems.insert({
        part: "snippet",
        resource: {
            snippet: {
                playlistId: playlistId,
                resourceId: video
            }
        }
    }).execute(function (response) {
        if (!response.result) {
            var vid = video.videoId;
            console.log("Error while inserting a video " + vid + "!");
            $("#errors").append(
                "<br><a href=\"https://www.youtube.com/watch?v=" +
                vid + "\">" + vid + "</a>"
            );
        }
        deferred.resolve();
        videosProcessedElem.text(+videosProcessedElem.text() + 1);
    });
    return deferred;
}

function insertVideos (playlistId, videos) {
    var deferredQueue = new DeferredQueue();
    videos.forEach(function (video) {
        deferredQueue.defer(function () {
            return insertVideo(playlistId, video);
        });
    });
    return deferredQueue.deferred;
}

function distributeVideos (playlistTitle, videos) {
    videosProcessedElem.text("0");
    totalVideosElem.text(videos.length);
    var playlistCount = Math.ceil(videos.length / MAX_PLAYLIST_SIZE);
    var deferreds = [];
    forRange(0, playlistCount, function (i) {
        var title = playlistCount == 1
            ? playlistTitle
            : playlistTitle + " #" + (i + 1);
        deferreds.push(
            createPlaylist(title).then(function (id) {
                var offset = i * MAX_PLAYLIST_SIZE;
                return insertVideos(id, videos.slice(offset, offset + MAX_PLAYLIST_SIZE));
            })
        );
    });
    return $.when.apply(this, deferreds);
}

function grabAll () {
    document.body.style.cursor = 'wait';
    loadClient
        .then(function () {
            var identifier = usernameOrChannelElem.val();
            var selectedType = $("[name='type']:checked").val();
            switch (selectedType) {
                case "username": return getUploadsChannel(identifier, null);
                case "channel": return getUploadsChannel(null, identifier);
            }
        })
        .then(getVideos)
        .then(function (videos) {
            return distributeVideos(playlistElem.val(), videos);
        })
        .then(
            function () { document.body.style.cursor = 'default'; },
            function (error) { alert(error); }
        );
}

$(function () {
    videosProcessedElem = $("#videosProcessed");
    totalVideosElem = $("#totalVideos");
    usernameOrChannelElem = $("#usernameOrChannel");
    playlistElem = $("#playlist");
});

function handleClientLoad () {
    loadClient = clientLoader();
    gapi.client.setApiKey(API_KEY);
    window.setTimeout(checkAuth, 1);
}
