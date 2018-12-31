const downloader = require('./downloader.js');
const utils = require('./utils.js');
const mainModule = require('../bot.js');
const CONFIG = require('../config.json');

module.exports = {
  async playSong(client, msg, newQueue) {
    // This will make an error in eslint, but moving it to the top doesn't work(?)
    const queueUtils = require('../musicbot/queue.js');
    mainModule.queue[msg.guild.id].playing = true;
    if (!newQueue || newQueue.length === 0 || !msg.guild.voiceConnection) {
      mainModule.queue[msg.guild.id].queueing = false;
      mainModule.queue[msg.guild.id].playing = false;
      mainModule.queue[msg.guild.id].firstSong = true;
      return;
    }

    const connection = msg.guild.voiceConnection;

    if (!newQueue[0].link) {
      utils.sendResponse(msg, 'An unknown error occurred. The queue was empty while trying to play the next song.', 'err');
      return;
    }
    newQueue[0].cached = false;
    newQueue[0].ffmpegCached = false;
    let embed;
    if (mainModule.queue[msg.guild.id].loop) {
      embed = {
        title: 'Looping song',
        description: `Looping \`${mainModule.queue[msg.guild.id][0].title}\` Use ${CONFIG.prefix}loop to toggle off or skip the song to stop`,
        color: 7506394,
        delete: true,
      };
    } else {
      const thisQueue = mainModule.queue[msg.guild.id];
      if (!thisQueue[0].usesFfmpeg) filters = 'None';
      else filters = thisQueue[0].usesFfmpeg.join(', ');
      embed = {
        color: 7506394,
        title: 'Playing song',
        description: `Requested by ${thisQueue[0].author}`,
        thumbnail: {
          url: thisQueue[0].thumbnail,
        },
        fields: [{
          name: 'Title',
          value: thisQueue[0].title,
          inline: false,
        }, {
          name: 'Length',
          value: thisQueue[0].length,
          inline: false,
        }, {
          name: 'Uploaded By',
          value: thisQueue[0].uploader,
          inline: false,
        }, {
          name: 'Video Stats',
          value: `Likes: ${thisQueue[0].likes} Dislikes: ${thisQueue[0].dislikes} Views: ${thisQueue[0].views}`,
          inline: false,
        }, {
          name: 'Filters',
          value: filters,
          inline: false,
        }],

      }
      //embed = await utils.getPlayResponse(client, newQueue[0].link, newQueue, msg).catch((err) => { console.log(`[ERROR] Failed to get playResponse data (in async call)! ${err}`); });
    }

    newQueue[0].cached = await utils.fileExists(`./audio_cache/${newQueue[0].filename}`);
    newQueue[0].ffmpegCached = await utils.fileExists(`./ffmpeg_cache/FFMPEG${newQueue[0].filename}.mp3`);

    console.log(`[CACHING] ${newQueue[0].cached}`);
    console.log(`[CACHING_FFMPEG] ${newQueue[0].ffmpegCached}`);
    if (!newQueue[0].cached) { // If its not cached and must be downloaded
      utils.sendResponse(msg, `Download of \`${newQueue[0].title}\` started`, 'success');
      await downloader.downloadYtdl(newQueue[0].link);
      console.log('finished downloading!');
      if (newQueue[0].usesFfmpeg) {
        try {
          utils.sendResponse(msg, 'Finished downloading. Now processing with ffmpeg...', 'success');
          console.log(`why${newQueue[0].usesFfmpeg}`);

          await downloader.processVideo(client, msg, newQueue[0].filename, newQueue[0].usesFfmpeg);

          const messageToDel = await msg.channel.send('', { embed }).catch((err) => { console.log(`[ERROR] Failed to send nowPlaying response! ${err}`); });
          setTimeout(() => {
            if (embed.delete) {
              messageToDel.delete()
                          .catch(e => console.log(`[ERROR] Failed to delete message: ${e}`));
            }
          }, 10000);

          const dispatcher = connection.play(`./ffmpeg_cache/FFMPEG${newQueue[0].filename}.mp3`, {
            volume: newQueue.volume / 100,
            passes: 3,
            bitrate: 96,
          });

          dispatcher.on('end', () => {
            if (connection.channel.members.array().length <= 1) {
              utils.sendResponse(msg, 'Everyone left the voice channel, stopping playback', 'info');
              mainModule.queue[msg.guild.id].splice(1);
              mainModule.queue[msg.guild.id].loop = false;
            }
            queueUtils.playNextSong(client, msg);
            dispatcher.destroy();
            // queue[msg.guild.id].queueing = false;
            console.log('Finished playing!');
          });
        } catch (err) {
          utils.sendResponse(msg, `FFMPEG ERROR: ${err}`, 'err');
        }
      } else { // If it doesn't use ffmpeg and it was just downloaded
        if (!msg.guild.voiceConnection) {
          console.log('[WARN] I am no longer in a voice channel after the video finished downloading!');
          return;
        }

        const messageToDel = await msg.channel.send('', { embed }).catch((err) => { console.log(`[ERROR] Failed to send nowPlaying response! ${err}`); });
        setTimeout(() => {
          if (embed.delete) {
            messageToDel.delete()
                        .catch(e => console.log(`[ERROR] Failed to delete message: ${e}`));
          }
        }, 10000);

        const dispatcher = connection.play(`./audio_cache/${newQueue[0].filename}`, {
          volume: newQueue.volume / 100,
          passes: 3,
          bitrate: 96,
        });

        dispatcher.on('end', () => {
          if (connection.channel.members.array().length <= 1) {
            utils.sendResponse(msg, 'Everyone left the voice channel, stopping playback', 'info');
            mainModule.queue[msg.guild.id].splice(1);
            mainModule.queue[msg.guild.id].loop = false;
          }
          queueUtils.playNextSong(client, msg);
          dispatcher.destroy();
          // queue[msg.guild.id].queueing = false;
          console.log('FUCK Finished playing!');
        });
      }
    } else if (newQueue[0].usesFfmpeg && newQueue[0].cached) {
      utils.sendResponse(msg, 'Processing with ffmpeg...', 'success');
      console.log(`what in heck ${newQueue[0].usesFfmpeg}`);

      await downloader.processVideo(client, msg, newQueue[0].filename, newQueue[0].usesFfmpeg);

      const messageToDel = await msg.channel.send('', { embed }).catch((err) => { console.log(`[ERROR] Failed to send nowPlaying response! ${err}`); });
      setTimeout(() => {
        if (embed.delete) {
          messageToDel.delete()
                      .catch(e => console.log(`[ERROR] Failed to delete message: ${e}`));
        }
      }, 10000);

      const dispatcher = connection.play(`./ffmpeg_cache/FFMPEG${newQueue[0].filename}.mp3`, {
        volume: newQueue.volume / 100,
        passes: 3,
        bitrate: 96,
      });

      dispatcher.on('end', () => {
        if (connection.channel.members.array().length <= 1) {
          utils.sendResponse(msg, 'Everyone left the voice channel, stopping playback', 'info');
          mainModule.queue[msg.guild.id].splice(1);
          mainModule.queue[msg.guild.id].loop = false;
        }
        queueUtils.playNextSong(client, msg);
        dispatcher.destroy();
        // queue[msg.guild.id].queueing = false;
        console.log('Finished playing!');
      });
    } else if (newQueue[0].cached && !newQueue[0].usesFfmpeg) {
      console.log('[INFO] Using cached version of song.');


      const dispatcher = connection.play(`./audio_cache/${newQueue[0].filename}`, {
        volume: newQueue.volume / 100,
        passes: 3,
        bitrate: 96,
      });

      const messageToDel = await msg.channel.send('', { embed }).catch((err) => { console.log(`[ERROR] Failed to send nowPlaying response! ${err}`); });
      setTimeout(() => {
        if (embed.delete) {
          messageToDel.delete()
                      .catch(e => console.log(`[ERROR] Failed to delete message: ${e}`));
        }
      }, 10000);

      dispatcher.on('end', () => {
        if (connection.channel.members.array().length <= 1) {
          utils.sendResponse(msg, 'Everyone left the voice channel, stopping playback', 'info');
          mainModule.queue[msg.guild.id].splice(1);
          mainModule.queue[msg.guild.id].loop = false;
        }
        queueUtils.playNextSong(client, msg);
        dispatcher.destroy();
        console.log('Finished playing!');
      });
    }
  },
};
