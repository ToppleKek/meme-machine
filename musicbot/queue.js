const CONFIG = require('../config.json');
const youtubedl = require('youtube-dl');
const utils = require('./utils.js');
const mainModule = require('../bot.js');
const player = require('./player.js');
const downloader = require('./downloader.js');

const maxFileSize = 536870912;

module.exports = {
  async addToQueue(client, msg, songUrl, usesFfmpeg) {
    let newSongUrl;
    // I hate this hack.
    if (songUrl.startsWith('https://youtu.be') || songUrl.startsWith('http://youtu.be')) newSongUrl = `https://www.youtube.com/watch?v=${utils.getId(songUrl)}`;
    else newSongUrl = songUrl;
    console.log(`NEW URL ${newSongUrl}`);

    const linkInfo = await utils.checkLink(newSongUrl);
    if (linkInfo.size > maxFileSize && !Number.isNaN(linkInfo.size)) {
      utils.sendResponse(msg, `Your song is too big to download. Your song: \`${linkInfo.size} Bytes\` Max size: \`${maxFileSize} Bytes\``, 'err');
      return;
    }
    if (!CONFIG.supportedMime.includes(linkInfo.type)) {
      if (!linkInfo.type.includes('audio') && !linkInfo.type.includes('video')) {
        utils.sendResponse(msg, `This MIME type is not supported. If you believe it should be, ask the owner to add it to the list of supported MIME types. Type: \`${linkInfo.type}\``, 'err');
        return;
      }
    }
    youtubedl.getInfo(newSongUrl, (err, info) => {
      if (err) {
        utils.sendResponse(msg, `YTDL ERROR: ${err}`, 'err');
        return;
      }

      if (Array.isArray(info)) {
        if (info.length > CONFIG.maxPlaylistSize && !utils.checkPermission(msg.author, msg, 'owner')) {
          utils.sendResponse(msg, `That playlist is too long. Max is: ${CONFIG.maxPlaylistSize} videos`, 'err');
          return;
        }
        utils.sendResponse(msg, 'Processing playlist...', 'info');
        for (let i = 0; i < info.length; i += 1) {
          let length;
          if (!info[i]._duration_hms) length = 'N/A';
          else length = info._duration_hms;
          mainModule.queue[msg.guild.id].push({
            title: info[i].title,
            link: info[i].webpage_url,
            author: msg.author.tag,
            filename: info[i]._filename,
            filesize: info[i].size,
            length,
            usesFfmpeg,
          });
        }
      } else {
        let length;
        let uploader;
        let likes;
        let dislikes;
        let views;
        let thumbnail;

        if (!info._duration_hms) length = 'N/A';
        else length = info._duration_hms;

        if (!info.thumbnail) thumbnail = msg.author.avatarURL({ size: 2048 });
        else thumbnail = info.thumbnail;

        if (!info.uploader) uploader = `${msg.author.tag} (Not found)`;
        else uploader = info.uploader;

        if (!info.like_count) likes = 'N/A';
        else likes = info.like_count;

        if (!info.dislike_count) dislikes = 'N/A';
        else dislikes = info.dislike_count;

        if (!info.view_count) views = 'N/A';
        else views = info.view_count;

        mainModule.queue[msg.guild.id].push({ // Add the song to the queue
          title: info.title,
          link: newSongUrl,
          author: msg.author.tag,
          filename: info._filename,
          filesize: info.size,
          length,
          uploader,
          likes,
          dislikes,
          views,
          thumbnail,
          usesFfmpeg,
        });
      }
      if (!mainModule.queue[msg.guild.id].queueing && mainModule.queue[msg.guild.id].firstSong) {
        mainModule.queue[msg.guild.id].firstSong = false;
        mainModule.queue[msg.guild.id].queueing = true; // Now its set to queueing because it is
        this.playNextSong(client, msg); // Now we play the next song
      } else {
        youtubedl.getInfo(newSongUrl, (error, info2) => {
          if (error) utils.sendResponse(msg, `There was an error getting video info: ${error}`, 'err');
          if (Array.isArray(info2)) return;
          let length;
          let thumbnail;
          if (!info2.thumbnail) thumbnail = msg.author.avatarURL({ size: 2048 });
          else thumbnail = info2.thumbnail;
          if (!info2._duration_hms) length = 'N/A';
          else length = info2._duration_hms;
          const embed = {
            color: 7506394,
            title: 'Added song to queue',
            description: `Requested by ${msg.author.tag}`,
            thumbnail: {
              url: thumbnail,
            },
            fields: [{
              name: 'Title',
              value: info2.title,
              inline: false,
            }, {
              name: 'Length',
              value: length,
              inline: false,
            }, {
              name: 'Position in queue', // TODO: make this better, if multiple songs are queued, they all have the same "position" because we're just using the length of the array.
              value: mainModule.queue[msg.guild.id].length - 1,
              inline: false,
            },
            ],
          };
          msg.channel.send('', { embed });
        });
      }
    });
  },

  playNextSong(client, msg) {
    mainModule.queue[msg.guild.id].skips = 0;
    mainModule.queue[msg.guild.id].skippers = [];
    if (mainModule.queue[msg.guild.id].playing && !mainModule.queue[msg.guild.id].loop) {
      this.removeFromQueue(mainModule.queue[msg.guild.id], 0);
    }
    player.playSong(client, msg, mainModule.queue[msg.guild.id]); // Now we play the next song
  },

  removeFromQueue(queue, index) {
    queue.splice(index, 1);
  },
};
