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
            trackProgress = 0;/*,
            playlist = playlist;*/
               var injector = angular.injector(['musicBucketEngine']);
               var _playlist = new injector.get('playlist').constructor();
               var _queue = new injector.get('queue').constructor();
               var SMSoundConverter = new injector.get('SMSoundConverter');
               var currentTrack = undefined;

           var angularPlayerInstance = {
             setCurrentTrack: function (key) {
               currentTrack = key;
             },
             getCurrentTrack: function () {
               return currentTrack;
             },
             setPlaylist: function (playlist) {
               $log.info('angular-player: set playlist...');
               $log.info(playlist);
               this.playlist = playlist;
               _playlist = playlist;
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

               //check if song already does not exists then add to playlist
               // var inArrayKey = this.isInArray(this.getPlaylist(), track.id);
               // if (inArrayKey === false) {
               //     console.log('song does not exists in playlist');

               //add to sound manager
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
               $log.info('angular-player: play song: ' + song.shared.getSongDescription());
               if (!_.isUndefined(this.getCurrentTrack())) {
                 $log.info('angular-player: stoping current track for playing new one');
                 this.stop();
               }
               //play it
               this.setCurrentTrack(song.shared);
               soundManager.play(song.shared.id);
               $rootScope.$broadcast('track:id', song.shared.id);

               //set as playing
               isPlaying = true;
               $rootScope.$broadcast('music:isPlaying', isPlaying);

               return song.shared.id;
             },
             createAndPlaySong : function(song) {
               $log.info('angular-player: create SMSound and play it then...');
               SMSoundConverter.createFromSong(song);
               this.playSong(song);
             },

             _isPushingNextSongToQueue : false,
             pushNextSongToQueue : function(onLoadCallback) {
               $log.info('angular-player: pushing new song to queue...');
               if (this._isPushingNextSongToQueue) {
                 $log.info('angular-player: ..some song already is being pushed to queue!.');
                 return;
               }
               this._isPushingNextSongToQueue = true;
               var _player = this;
               _playlist.getNext()
                 // TODO: Cannot then of undefinied ??? (connection error, to check)
                 .then(function(nextTrack) {
                         $log.info('angular-player: Queue: new song in queue!');
                         $log.info(nextTrack);
                         var queueEntry;
                         _player.queue.enqueue(nextTrack);
                         onLoadCallback(nextTrack);
                         _player._isPushingNextSongToQueue = false;
                       })
                 .catch(function(response) {
                          $log.warn('angular-player: ..Queueing error!');
                          $log.warn(response);
                          _player._isPushingNextSongToQueue = false;
                          _player.nextTrack(); // try to get next song
                        });
             },
             play: function () {
               $log.info('angular-player: Play called!.');
               var _player = this;
               var trackToPlay;
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
                 $log.info('angular-player: Play: just play current Track');
                 _player.playSong(this.getCurrentTrack());
               }
             },
             pause: function () {
               $log.info('angular-player: Pause track');
               soundManager.pause(this.getCurrentTrack().id);

               //set as not playing
               isPlaying = false;
               $rootScope.$broadcast('music:isPlaying', this.isPlaying);
             },
             stop: function () {
               $log.info('angular-player: Stop track');
               //first pause it
               this.pause();

               this.resetProgress();
               $rootScope.$broadcast('track:progress', trackProgress);
               //$rootScope.$broadcast('currentTrack:position', 0);
               //$rootScope.$broadcast('currentTrack:duration', 0);

               soundManager.stopAll();
               soundManager.unload(this.getCurrentTrack().id);
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
                   if (!queueEntry.buffered) queueEntry.buffer();
                   if (queueEntry !== null) _player.playSong(queueEntry.song);
                 });
               } else {
                 var queueEntry = _player.queue.dequeue();
                 if (queueEntry !== null) _player.playSong(queueEntry.song);
               }
               // Queue empty? Add new song then:
               if (!this.queue.hasNext()) {
                 $log.info('angular-player: Next track: ...pushing new song to queue too!');
                 this.pushNextSongToQueue( function(song) {
                   _queue.bufferNext();
                 });
               } else {
                 _queue.bufferNext();
               }
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
                    if(!$rootScope.$$phase) {
                      $rootScope.$broadcast('currentTrack:bytesLoaded',
                                            {loaded: song.bytesLoaded, total: song.bytesTotal});
                    }

                  if (!_.isUndefined(song.bytesLoaded) && (song.bytesLoaded / song.bytesTotal
                    ) <= 0.9) {
                    if (!_queue.hasNext()) {
                      var elem = angular.element(document.querySelector('[ng-controller]'));
                      //get the injector.
                      var injector = elem.injector();
                      //get the service.
                      var angularPlayer = injector.get('angularPlayer');
                      angularPlayer.pushNextSongToQueue(function (song) {
                        _queue.bufferNext();
                      });
                    } else {
                      _queue.bufferNext();
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
                            // if (autoPlay === true) {
                                //play next track if autoplay is on
                                //get your angular element
                                var elem = angular.element(document.querySelector('[ng-controller]'));
                                //get the injector.
                                var injector = elem.injector();
                                //get the service.
                                var angularPlayer = injector.get('angularPlayer');
                                $log.info('angular-player: finish playing event: ' + angularPlayer.getCurrentTrack().getSongDescription());
                                angularPlayer.nextTrack();

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

                  setTimeout(function() {
                    angularPlayerInstance.pushNextSongToQueue(function (song) {
                      _queue.bufferNext();
                    });
                  }, 25);

                });
            }

           return angularPlayerInstance;
    }])

    .directive('soundManager', ['$filter', 'angularPlayer', function ($filter, angularPlayer) {
        return {
            restrict: "E",
            link: function (scope, element, attrs) {

                //init and load sound manager 2
                angularPlayer.init();

                scope.$on('track:progress', function (event, data) {
                    scope.$apply(function () {
                        scope.progress = data;
                    });
                });

                scope.$on('track:id', function (event, data) {
                    scope.$apply(function () {
                        scope.currentPlaying = angularPlayer.currentTrackData();
                    });
                });

                scope.$on('currentTrack:position', function (event, data) {
                    scope.$apply(function () {
                        scope.currentPostion = $filter('humanTime')(data);
                    });
                });

                scope.$on('currentTrack:duration', function (event, data) {
                    scope.$apply(function () {
                        scope.currentDuration = $filter('humanTime')(data);
                    });
                });
                scope.$on('currentTrack:bytesLoaded', function (event, data) {
                    scope.$apply(function() {
                      scope.downloadProgress = data.loaded / data.total;
                    });
                });

                scope.isPlaying = false;
                scope.$on('music:isPlaying', function (event, data) {
                    scope.$apply(function () {
                        scope.isPlaying = data;
                    });
                });

                scope.playlist = angularPlayer.getPlaylist(); //on load
                scope.$on('player:playlist', function (event, data) {
                    scope.$apply(function () {
                        scope.playlist = data;
                    });
                });
            }
        };
    }])
    .directive('musicPlayer', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            scope: {
                song: "=addSong"
            },
            link: function (scope, element, attrs) {
                var addToPlaylist = function () {
                    var trackId = angularPlayer.addTrack(scope.song);

                    //if request to play the track
                    if (attrs.musicPlayer === 'play') {
                        angularPlayer.playTrack(trackId);
                    }
                };

                element.bind('click', function () {
                    console.log('adding song to playlist');
                    addToPlaylist();
                });
            }
        };
    }])
    .directive('playFromPlaylist', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            scope: {
                song: "=playFromPlaylist"
            },
            link: function (scope, element, attrs) {
                element.bind('click', function (event) {
                    angularPlayer.playTrack(scope.song.id);
                });
            }
        };
    }])
    .directive('removeFromPlaylist', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            scope: {
                song: "=removeFromPlaylist"
            },
            link: function (scope, element, attrs) {
                element.bind('click', function (event) {
                    angularPlayer.removeSong(scope.song.id, attrs.index);
                });
            }
        };
    }])
    .directive('seekTrack', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    if (angularPlayer.getCurrentTrack() === null) {
                        console.log('no track loaded');
                        return;
                    }

                    var sound = soundManager.getSoundById(angularPlayer.getCurrentTrack());

                    var x = event.offsetX,
                        width = element[0].clientWidth,
                        duration = sound.durationEstimate;

                    sound.setPosition((x / width) * duration);
                });

            }
        };
    }])
    .directive('playMusic', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    angularPlayer.play();
                });

            }
        };
    }])
    .directive('pauseMusic', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {
                element.bind('click', function (event) {
                    angularPlayer.pause();
                });
            }
        };
    }])
    .directive('stopMusic', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {
                element.bind('click', function (event) {
                    angularPlayer.stop();
                });
            }
        };
    }])
    .directive('nextTrack', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    angularPlayer.nextTrack();
                });

            }
        };
    }])
    .directive('prevTrack', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    angularPlayer.prevTrack();
                });

            }
        };
    }])
    .directive('muteMusic', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    angularPlayer.mute();
                });

                scope.mute = angularPlayer.getMuteStatus();
                scope.$on('music:mute', function (event, data) {
                    scope.$apply(function () {
                        scope.mute = data;
                    });
                });

            }
        };
    }])
    .directive('repeatMusic', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    angularPlayer.repeatToggle();
                });

                scope.repeat = angularPlayer.getRepeatStatus();
                scope.$on('music:repeat', function (event, data) {
                    scope.$apply(function () {
                        scope.repeat = data;
                    });
                });
            }
        };
    }])
    .directive('musicVolume', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    if (attrs.type === 'increase') {
                        angularPlayer.adjustVolume(true);
                    } else {
                        angularPlayer.adjustVolume(false);
                    }
                });

                scope.volume = angularPlayer.getVolume();
                scope.$on('music:volume', function (event, data) {
                    scope.$apply(function () {
                        scope.volume = data;
                    });
                });

            }
        };
    }])
    .directive('clearPlaylist', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {
                    //first stop any playing music
                    angularPlayer.stop();
                    angularPlayer.setCurrentTrack(null);

                    angularPlayer.clearPlaylist(function (data) {
                    	console.log('all clear!');
                    });
                });

            }
        };
    }])
    .directive('playAll', ['angularPlayer', function (angularPlayer) {
        return {
            restrict: "EA",
            scope: {
                songs: '=playAll'
            },
            link: function (scope, element, attrs) {

                element.bind('click', function (event) {

                    //first clear the playlist
                    angularPlayer.clearPlaylist(function (data) {
                        console.log('cleared, ok now add to playlist');
                        //add songs to playlist
                        for (var i = 0; i < scope.songs.length; i++) {
                            angularPlayer.addTrack(scope.songs[i]);
                        }

                        //play first song
                        angularPlayer.play();
                    });

                });

            }
        };
    }]);
