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

    .factory('angularPlayer', [ '$rootScope', '$log', 'playlist', function ($rootScope, $log) {


        var repeat = false,
            autoPlay = true,
            isPlaying = false,
            volume = 90,
            bufferingNextSongAlreadyCalled = false,
            trackProgress = 0;/*,
            playlist = playlist;*/
               var injector = angular.injector(['musicBucketEngine']);
               var _playlist = new injector.get('playlist').constructor();
               var _queue = new injector.get('queue').constructor();
               var SMSoundConverter = new injector.get('SMSoundConverter');
               var currentTrack = undefined;
               var currentSong = undefined;

           var angularPlayerInstance = {
             /* Current song: song obj */
             setCurrentSong: function (song) {
               currentSong = song;
               currentTrack = song.shared;
             },
             getCurrentSong: function () {
               return currentSong;
             },
             /* Current track: song.shared */
             setCurrentTrack: function (track) {
               // TODO: Should it stay here?
               currentTrack = track;
             },
             getCurrentTrack: function () {
               return currentTrack;
             },
             setPlaylist: function (playlist) {
               $log.info('angular-player: set playlist...');
               $log.info(playlist);
               this.playlist = playlist;
               _playlist = playlist;

               // Pre-buffer first song:
               setTimeout(function() {
                 angularPlayerInstance.pushNextSongToQueue(function (song) {
                   _queue.bufferNext();
                 });
               }, 25);
             },
             getPlaylist: function (key) {
               if (typeof key === 'undefined') {
                 return _playlist;
               } else {
                 return _playlist[key];
               }
             },
             playlist : _playlist,
             queue : _queue,
             addToPlaylist: function (entry) {
               _playlist.addEntry(entry)
               //broadcast playlist
               $rootScope.$broadcast('player:playlist', _playlist);
             },
             addTrack: function (track) {
               //check if mime is playable first: -dk
               if (!soundManager.canPlayMIME(track.type)) {
                 //check if url is playable
                 if (soundManager.canPlayURL(track.url) !== true) {
                   console.log('invalid song url');
                   return null;
                 }
               }
               soundManager.createSound({
                                          id: song.shared.id,
                                          url: song.shared.url
                                        });

               // DK: Sounds played by this method should be from playlist already
               //add to playlist
               //this.addToPlaylist(song);
               // }

               return track.id;
             },
             removeSong: function (song, index) {
               //if this song is playing stop it
               if (song === currentTrack) {
                 this.stop();
               }

               //unload from soundManager
               soundManager.destroySound(song);

               //remove from playlist
               _playlist.splice(index, 1);

               //once all done then broadcast
               $rootScope.$broadcast('player:playlist', _playlist);
             },
             playSong : function(song) {
               // if there is current track, stop it from playing:
               $log.info('angular-player: play song: ' + song.shared.id + ' - ' + song.shared.getSongDescription());
               if (!_.isUndefined(this.getCurrentTrack()) && this.getCurrentTrack() !== song) {
                 $log.info('angular-player: stoping current track for playing new one');
                 this.stop();
               }
               //play it
               // TODO: Let it use play method
               bufferingNextSongAlreadyCalled = false;
               this.setCurrentSong(song);
               this.setCurrentTrack(song.shared); // <- only for clarity
               soundManager.play(this.getCurrentTrack().id);
               $rootScope.$broadcast('track:id', this.getCurrentTrack().id);

               //set as playing
               isPlaying = true;
               $rootScope.$broadcast('music:isPlaying', isPlaying);

               return this.getCurrentTrack().id;
             },

             //_isPushingNextSongToQueue : false,
             pushNextSongToQueue : function(onLoadCallback) {
               $log.info('angular-player: pushing new song to queue...');
               // if (this._isPushingNextSongToQueue) {
               //   $log.info('angular-player: ..some song already is being pushed to queue!.');
               //   return;
               // }
               // this._isPushingNextSongToQueue = true;
               var _player = this;
               _playlist.getNext()
                 // TODO: Cannot then of undefinied ??? (connection error, to check)
                 .then(function(nextTrack) {
                         $log.info('angular-player: Queue: new song in queue!');
                         $log.info(nextTrack);
                         var queueEntry;
                         _player.queue.enqueue(nextTrack);
                         onLoadCallback(nextTrack);
                         // _player._isPushingNextSongToQueue = false;
                       })
                 .catch(function(response) {
                          $log.warn('angular-player: ..Queueing error!');
                          $log.warn(response);
                          // _player._isPushingNextSongToQueue = false;
                          _player.nextTrack(); // try to get next song
                        });
             },
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
                     if (!queueEntry.buffered) queueEntry.buffer();
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
               soundManager.pause(this.getCurrentTrack().id);

               //set as not playing
               isPlaying = false;
               $rootScope.$broadcast('music:isPlaying', this.isPlaying);
             },
             stop: function () {
               $log.info('angular-player: Stop track '+this.getCurrentTrack().id);
               //first pause it
               this.pause();

               this.resetProgress();
               soundManager.setPosition(this.getCurrentTrack().id, 0);
               // $rootScope.$broadcast('track:progress', trackProgress);
               //$rootScope.$broadcast('currentTrack:position', 0);
               //$rootScope.$broadcast('currentTrack:duration', 0);

               soundManager.stopAll();
               // soundManager.unload(this.getCurrentTrack().id);
             },

             togglePlay : function() {
               $log.info('angular-player: TogglePlay track: '+this.isPlaying);
               if(this.isPlaying) this.pause();
               else this.play();
               this.isPlaying = !this.isPlaying;
             },

             playTrack: function (trackId) {
               $log.info('angular-player: playTrack: '+trackId);
               this.initPlayTrack(trackId);
             },
             nextTrack: function () {
               $log.info('angular-player: Next track...');
               var _player = this;

               // Get next song from queue:
               if (!this.queue.hasNext()) {
                 $log.info('angular-player: Next track: ...still not in queue, queueing');
                 this.pushNextSongToQueue(function(nextTrack) {
                   var queueEntry = _player.queue.dequeue();
                   queueEntry.buffer();
                   if (queueEntry !== null) _player.playSong(queueEntry.song);
                 });
               } else {
                 $log.info('angular-player: Next track: ...playing song from queue');
                 var queueEntry = _player.queue.dequeue();
                 if (queueEntry !== null) _player.playSong(queueEntry.song);
               }
               // Queue empty? Add new song then:
               // DK: TEMP Queue only when old song is fully loaded.
               // if (!this.queue.hasNext()) {
               //   $log.info('angular-player: Next track: ...pushing new song to queue too!');
               //   this.pushNextSongToQueue( function(song) {
               //     _queue.bufferNext();
               //   });
               // } else {
               //   _queue.bufferNext();
               // }
             },
             prevTrack: function () {
               $log.warn('angular-player: Previous Track, need reimplementation!!!');
               // var currentTrackKey = this.getIndexByValue(soundManager.soundIDs, this.getCurrentTrack());
               var prevTrackKey = +currentTrackKey - 1;
               var prevTrack = soundManager.soundIDs[prevTrackKey];

               if (typeof prevTrack !== 'undefined') {
                 this.playTrack(prevTrack);
               } else {
                 console.log('no prev track found!');
               }
             },
             mute: function () {
               if (soundManager.muted === true) {
                 soundManager.unmute()
               } else {
                 soundManager.mute();
               }

               $rootScope.$broadcast('music:mute', soundManager.muted);
             },
             getMuteStatus: function () {
               return soundManager.muted;
             },
             getVolume: function () {
               return volume;
             },
             adjustVolume: function (increase) {
               var changeVolume = function (volume) {
                 for (var i = 0; i < soundManager.soundIDs.length; i++) {
                   var mySound = soundManager.getSoundById(soundManager.soundIDs[i]);
                   mySound.setVolume(volume);
                 }

                 $rootScope.$broadcast('music:volume', volume);
               };

               if (increase === true) {
                 if (volume < 100) {
                   volume = volume + 10;
                   changeVolume(volume);
                 }
               } else {
                 if (volume > 0) {
                   volume = volume - 10;
                   changeVolume(volume);
                 }
               }
             },
             clearPlaylist: function (callback) {
             },
             resetProgress: function () {
               trackProgress = 0;
             }

           };
           angularPlayerInstance.init = function () {

                function updateSongBytesLoaded(song) {
                  //soundManager._writeDebug('sound '+this.id+' loading, '+this.bytesLoaded+' of '+this.bytesTotal);
                  //broadcast track download progress:
                  if (!_.isUndefined(currentTrack) && song.id === currentTrack.id)
                    if (!$rootScope.$$phase) {
                      $rootScope.$broadcast('currentTrack:bytesLoaded',
                                            {loaded: song.bytesLoaded, total: song.bytesTotal});
                    }

                  if (!_.isUndefined(song.bytesLoaded) && ((song.bytesLoaded / song.bytesTotal ) >= 0.5 )) {

                    if (bufferingNextSongAlreadyCalled == false) {
                      $log.info('angular-player: loaded 99% of song, going to push new song in queue!');
                      bufferingNextSongAlreadyCalled = true;
                      if (!_queue.hasNext()) {
                        angularPlayerInstance.pushNextSongToQueue(function (song) {
                          _queue.bufferNext();
                        });
                      } else {
                        _queue.bufferNext();
                      }
                    }
                 }
                }
                if (typeof soundManager === 'undefined') {
                    alert('Please include SoundManager2 Library!');
                }

                soundManager.setup({
                    //url: '/path/to/swfs/',
                    //flashVersion: 9,
                    preferFlash: false, // prefer 100% HTML5 mode, where both supported
                    debugMode: true, // enable debugging output (console.log() with HTML fallback)
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
                        onid3: null, // callback function for "ID3 data is added/available"
                        onload: null, // callback function for "load finished"
                        onstop: null, // callback for "user stop"
                        onpause: null, // callback for "pause"
                        onplay: function() {
                          // BUGFIX: Some songs could be fully buffered b4 start of playing, so whileloading
                          // won't fire with them, in that case, we UP this value from here:
                          updateSongBytesLoaded(this);
                        }, // callback for "play" start
                        ontimeout : function(status) {
                          console.log("SM2 Timeout event: ");
                          console.log(status);
                        },
                        onresume: null, // callback for "resume" (pause toggle)
                        position: null, // offset (milliseconds) to seek to within downloaded sound.
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
                          updateSongBytesLoaded(this);
                        },
                        whileplaying: function () {
                          // $log.info('angular-player: whileplaying event: ' + this.position + " / " + this.duration);

                            //broadcast current playing track progress
                            trackProgress = ((this.position / this.duration) * 100);
                            $rootScope.$broadcast('track:progress', trackProgress);

                            //broadcast track position
                            $rootScope.$broadcast('currentTrack:position', this.position);

                            //broadcast track duration
                            $rootScope.$broadcast('currentTrack:duration', this.duration);
                        },
                        onfinish: function () {
                          /*
                          * Chained playback (sequential / playlist-style behaviour) works when using the onfinish
                          * event handler. Otherwise, blocking occurs.
                          * */
                          $log.info('angular-player: onfinish event on currentTrack: ' + currentTrack.id);
                               // if (autoPlay === true) {
                                //play next track if autoplay is on
                                //get your angular element
                          // angularPlayerInstance.playSong(currentTrack);
                          angularPlayerInstance.nextTrack();

                          /*
                          angularPlayerInstance.stop();
                          var queueEntry = angularPlayerInstance.queue.dequeue();
                          queueEntry.buffer();
                          if (queueEntry !== null) soundManager.play(queueEntry.song.shared.id);
                          $log.info('angular-player: onfinish, playing next:  ' + queueEntry.song.shared.id);
                          */
                                $rootScope.$broadcast('track:id', currentTrack);
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
    }])
