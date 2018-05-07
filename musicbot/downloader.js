const youtubedl = require('youtube-dl');
const ffmpeg = require('fluent-ffmpeg');
const mainModule = require('../bot.js');
const CONFIG = require('../config.json');
const utils = require('./utils.js');
const { exec } = require('child_process');
const fs = require('fs');

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
            filters.push(`bass=g=${bassGain}:f=50`);
            break;
          case 'echo':
            filters.push('aecho=0.8:0.6:1000:0.8');
            break;
          case 'ftempo':
            filters.push('atempo=1.5');
            break;
          case 'stempo':
            filters.push('atempo=0.5');
            break;
          case 'fspeed':
            filters.push('asetrate=60000');
            break;
          case 'sspeed':
            filters.push('asetrate=20000');
            break;
          case 'vibrato':
            filters.push('vibrato=f=15:d=0.5');
            break;
        }
      }
      // This is a mess
      console.log(`Started Processing, filters are: ${filters.join(',')}`);
      exec(`ffmpeg -y -i "./audio_cache/${video}" -codec:a libmp3lame "./ffmpeg_cache/PREFFMPEG${video}.mp3"`, (err, stdout, stderr) => {
        // We have to convert it to mp3 first because it errors out with vibrato if we don't
        if (err) {
          utils.logError(client, msg, 'FFMPEG ERROR', `Ffmpeg threw an error while processing a video! Error: ${err}`);
          console.log(err);
          resolve('error');
        }
        console.log('[INFO] Converted video to mp3, now applying filters');
        fs.stat(`./ffmpeg_cache/FFMPEG${video}.mp3`, (err, stats) => {
          if (err) {
            console.log('NOTUSING -y FILE EXISTS');
            exec(`ffmpeg -y -i "./ffmpeg_cache/PREFFMPEG${video}.mp3" -codec:a libmp3lame -af ${filters.join(',')} "./ffmpeg_cache/FFMPEG${video}.mp3"`, (err, stdout, stderr) => {
              console.log('Finished Processing');
              if (err) {
                utils.logError(client, msg, 'FFMPEG ERROR', `Ffmpeg threw an error while processing a video! Error: ${err}`);
                console.log(err);
                resolve('error');
              }
              //if (stderr) utils.logError(client, msg, 'FFMPEG ERROR', `Ffmpeg threw an error while processing a video! Error: ${stderr}`);
              console.log(stdout);
              resolve(`./ffmpeg_cache/FFMPEG${video}.mp3`);
            });
          } else {
            console.log('USING -y FILE EXISTS');
            exec(`rm -f "./ffmpeg_cache/FFMPEG${video}.mp3"`, (err, stdout, stderr) => {
              if (err) console.log(err);
              if (stderr) console.log(stderr);
              console.log('FUCK');
              exec(`ffmpeg -y -i "./ffmpeg_cache/PREFFMPEG${video}.mp3" -codec:a libmp3lame -af ${filters.join(',')} "./ffmpeg_cache/FFMPEG${video}.mp3"`, (err, stdout, stderr) => {
                console.log('Finished Processing');
                if (err) {
                  utils.logError(client, msg, 'FFMPEG ERROR', `Ffmpeg threw an error while processing a video! Error: ${err}`);
                  console.log(err);
                  resolve('error');
                }
                //if (stderr) utils.logError(client, msg, 'FFMPEG ERROR', `Ffmpeg threw an error while processing a video! Error: ${stderr}`);
                console.log(stdout);
                resolve(`./ffmpeg_cache/FFMPEG${video}.mp3`);
              });
            });
          }
        });
      });
    });
  },
};
