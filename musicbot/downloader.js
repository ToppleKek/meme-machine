const youtubedl = require('youtube-dl');
const ffmpeg = require('fluent-ffmpeg');
const mainModule = require('../bot.js');
const CONFIG = require('../config.json');
const utils = require('./utils.js');

const bassGain = 25;

module.exports = {
  downloadYtdl(url) {
    return new Promise((resolve) => {
      youtubedl.exec(url, ['-o', './audio_cache/%(title)s-%(id)s.%(ext)s', '-f', 'best'], { maxBuffer: Infinity }, (err, output) => {
        if (err) console.log(`[ERROR] Downloader: ${err}`);
        if (output) console.log(output.join('\n'));
        resolve('Success');
      });
    });
  },

  processVideo(client, msg, video, type) {
    return new Promise((resolve) => {
      const filters = [];
      for (let i = 0; i < CONFIG.maxFilters; i += 1) {
        switch (type[i]) {
          case 'bass':
            filters.push({
              filter: 'bass',
              options: `g=${bassGain}:f=50`,
            });
            break;
          case 'echo':
            filters.push({
              filter: 'aecho',
              options: '0.8:0.6:1000:0.8',
            });
            break;
          case 'ftempo':
            filters.push({
              filter: 'atempo',
              options: '1.5',
            });
            break;
          case 'stempo':
            filters.push({
              filter: 'atempo',
              options: '0.5',
            });
            break;
          case 'fspeed':
            filters.push({
              filter: 'asetrate',
              options: '60000',
            });
            break;
          case 'sspeed':
            filters.push({
              filter: 'asetrate',
              options: '20000',
            });
            break;
        }
      }
      try {
        ffmpeg(`./audio_cache/${video}`).audioFilters(filters)
          .audioCodec('libmp3lame')
          .noVideo()
          .output(`./ffmpeg_cache/FFMPEG${video}.mp3`)
          .on('end', () => {
            console.log('[FFMPEG] Finished Processing');
            resolve(`./audio_cache/${video}`);
          })
          .run();
      } catch (err) { utils.logError(client, msg, 'FFMPEG ERROR', `Ffmpeg threw an error while processing a video! Error: ${err}`); }
    });
  },
};
