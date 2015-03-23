angular.module('angularSoundManager', ['musicBucketEngine'])

    .filter('humanTime', function () {
        return function (input) {
            function pad(d) {
                return (d < 10) ? '0' + d.toString() : d.toString();
            }

            var min = (input / 1000 / 60) << 0,
                sec = Math.round((input / 1000) % 60);

            return pad(min) + ':' + pad(sec);
        };
    })

    .factory('angularPlayer', function ($rootScope, $log, playlist) {


        var isPlaying = false,
            volume = 90,
            bufferingNextSongAlreadyCalled = false,
            trackProgress = 0;
               var injector = angular.injector(['musicBucketEngine']);
               var _playlist;
               var currentTrack = undefined;

           var angularPlayerInstance = {

             play: function () {
               $log.info('angular-player: Play called!.');
               var _player = this;
               var trackToPlay;
               bufferingNextSongAlreadyCalled = false;
               if (_.isUndefined(this.getCurrentTrack())) {
                 // player not played anything, get a track
                 // There is no any in queue? Create sth..
                 $log.info('angular-player: Play: there is no currentTrack');
                 if (!this.queue.hasNext()) {
                   $log.info('angular-player: Play: there is no song in Queue, pushing some...');
                   this.pushNextSongToQueue(function(nextTrack) {
                     var queueEntry = _player.queue.dequeue();
                     if (!queueEntry.song.isBuffered()) queueEntry.song.buffer();
                     if (queueEntry !== null) /* setTimeout(function() { */_player.playSong(queueEntry.song); // }, 0);
                   });
                 } else {
                   $log.info('angular-player: Play: getting song from queue...');
                   var queueEntry = _player.queue.dequeue();
                   if(queueEntry !== null) _player.playSong(queueEntry.song);
                 }
               } else {
                 $log.info('angular-player: Play: just play current Song');
                 _player.playSong(this.getCurrentSong());
               }
             },
             pause: function () {
               $log.info('angular-player: Pause track '+this.getCurrentTrack().id);
               this.getCurrentSong().pause();

               //set as not playing
               isPlaying = false;
               $rootScope.$broadcast('music:isPlaying', this.isPlaying);
             },
             stop: function () {
               $log.info('angular-player: Stop track '+this.getCurrentTrack().id);
               this.pause();
               this.resetProgress();
               this.getCurrentSong().seek(0);
               this.getCurrentSong().stop();
             },

             togglePlay : function() {
               $log.info('angular-player: TogglePlay track: '+this.isPlaying);
               if(this.isPlaying) this.pause();
               else this.play();
               this.isPlaying = !this.isPlaying;
             },
             nextTrack: function () {
               $log.info('angular-player: Next track...');
               var _player = this;

               // Get next song from queue:
               if (!this.queue.hasNext()) {
                 $log.info('angular-player: Next track: ...still not in queue, queueing');
                 this.pushNextSongToQueue(function(nextTrack) {
                   var queueEntry = _player.queue.dequeue();
                   queueEntry.song.buffer();
                   if (queueEntry !== null) _player.playSong(queueEntry.song);
                 });
               } else {
                 $log.info('angular-player: Next track: ...playing song from queue');
                 var queueEntry = _player.queue.dequeue();
                 if (queueEntry !== null) _player.playSong(queueEntry.song);
               }
             },
             prevTrack: function () {
               var currentSong = this.getCurrentSong();
               if (!_.isUndefined(currentSong)) {
                 // Add to queue (in first pos) so it will be next after backed song:
                 this.queue.enqueueNext(currentSong);
               }
               this.playSong(this.tracksHistory.restoreLastSong(), false);
             },
             mute: function () {
               this.getCurrentSong().mute();
               $rootScope.$broadcast('music:mute', soundManager.muted);
             },
             getMuteStatus: function () {
               return soundManager.muted;
             },
             getVolume: function () {
               return volume;
             },
             adjustVolume: function (vol) {
               this.getCurrentSong().setVolume(vol);
             },
             resetProgress: function () {
               trackProgress = 0;
             },
           };
           angularPlayerInstance.init = function (basePlayerEngine) {
                var mbPlayerEngine = basePlayerEngine;
                if (typeof soundManager === 'undefined') {
                    alert('Please include SoundManager2 Library!');
                }

                soundManager.setup({
                    //url: '/path/to/swfs/',
                    //flashVersion: 9,
                    preferFlash: false, // prefer 100% HTML5 mode, where both supported
                    debugMode: false, // enable debugging output (console.log() with HTML fallback)
                    useHTML5Audio: true,
                    currentTrack : null,
                    onready: function () {
                        //console.log('sound manager ready!');
                    },
                    ontimeout: function () {
                        alert('SM2 failed to start. Flash missing, blocked or security error?');
                        alert('The status is ' + status.success + ', the error type is ' + status.error.type);
                    },
                    defaultOptions: {
                        // set global default volume for all sound objects
                        autoLoad: true, // enable automatic loading (otherwise .load() will call with .play())
                        autoPlay: false, // enable playing of file ASAP (much faster if "stream" is true)
                        from: null, // position to start playback within a sound (msec), see demo
                        loops: 1, // number of times to play the sound. Related: looping (API demo)
                        multiShot: false, // let sounds "restart" or "chorus" when played multiple times..
                        multiShotEvents: false, // allow events (onfinish()) to fire for each shot, if supported.
                        onid3: undefined, // callback function for "ID3 data is added/available"
                        onload: undefined, // callback function for "load finished"
                        onstop: undefined, // callback for "user stop"
                        onpause: undefined, // callback for "pause"
                        onerror: function(err) {
                          $log.error("Error happened: "+err);
                        },
                        onplay: function() {
                          // BUGFIX: Some songs could be fully buffered b4 start of playing, so whileloading
                          // won't fire with them, in that case, we UP this value from here:
                          mbPlayerEngine.events.onplay(this.id);
                        }, // callback for "play" start
                        ontimeout : function(status) {
                          console.log("SM2 Timeout event: ");
                          console.log(status);
                        },
                        onresume: undefined, // callback for "resume" (pause toggle)
                        position: undefined, // offset (milliseconds) to seek to within downloaded sound.
                        pan: 0, // "pan" settings, left-to-right, -100 to 100
                        stream: true, // allows playing before entire file has loaded (recommended)
                        to: null, // position to end playback within a sound (msec), see demo
                        type: null, // MIME-like hint for canPlay() tests, eg. 'audio/mp3'
                        usePolicyFile: false, // enable crossdomain.xml request for remote domains (for ID3/waveform access)
                        volume: volume, // self-explanatory. 0-100, the latter being the max.
                        whileloading: function () {
                            //soundManager._writeDebug('sound '+this.id+' loading, '+this.bytesLoaded+' of '+this.bytesTotal);
                          //broadcast track download progress:
                          // $log.info('angular-player: whileloading event: ' + this.bytesLoaded + " / " + this.bytesTotal);
                          mbPlayerEngine.events.whileloading(this.id);
                        },
                        whileplaying: function () {
                          // $log.info('angular-player: whileplaying event: ' + this.position + " / " + this.duration);

                            //broadcast current playing track progress
                          mbPlayerEngine.events.whileplaying(this.id);

                        },
                        onfinish: function () {
                          mbPlayerEngine.events.onfinish();
                            // }
                        }
                    }
                });
                soundManager.onready(function () {
                    console.log('song manager ready!');
                    // Ready to use; soundManager.createSound() etc. can now be called.
                    var isSupported = soundManager.ok();
                    console.log('is supported: ' + isSupported);
                    $rootScope.$broadcast('angularPlayer:ready', true);
                });
            }

           return angularPlayerInstance;
    })
