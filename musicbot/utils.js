const CONFIG = require('../config.json');
const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
const youtubedl = require('youtube-dl');
const mainModule = require('../bot.js');
const fs = require('fs');

module.exports = {
  setGame(client, game, type) {
    let gameType;
    switch (type) {
      case 'playing':
        gameType = 'PLAYING';
        break;
      case 'watching':
        gameType = 'WATCHING';
        break;
      case 'listening':
        gameType = 'LISTENING';
        break;
      default:
        gameType = 'ERROR';
    }
    client.user.setPresence({
      activity: {
        name: game,
        type: gameType,
      },
    }).catch((error) => {
      console.log(`[ERROR] In setGame: ${error}`);
    });
  },

  sendResponse(msg, message, type) { // will take "err", "info" or "success" for type
    let colour;

    if (type === 'err') colour = 11736341;
    else if (type === 'info') colour = 7506394;
    else if (type === 'success') colour = 1571692;

    msg.channel.send({
      embed: {
        color: colour,
        description: message,
        timestamp: new Date(),
      },
    });
  },

  checkPermission(usr, msg, type) {
    if (type === 'admin') return msg.guild.member(usr).permissions.has('ADMINISTRATOR');
    else if (type === 'server') return msg.guild.member(usr).permissions.has('MANAGE_GUILD');
    else if (type === 'voice') {
      return !!(msg.guild.member(usr).voiceChannel && msg.guild.member(usr).voiceChannel.id === msg.guild.voiceConnection.channel.id);
    } else if (type === 'owner') {
      return usr.id === CONFIG.ownerid;
    }
    return false;
  },

  getId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);

    if (match && match[2].length === 11) {
      return match[2];
    }
    return 'error';
  },

  checkLink(url) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, true);
      // Ill look into this
      xhr.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
          console.log(`[DEBUG] Status of XMLHTTPREQUEST: ${this.status}`);
          console.log(`[DEBUG] Content type: ${this.getResponseHeader('Content-Type')}`);
          const info = {};
          info.type = this.getResponseHeader('Content-Type');
          info.size = parseInt(this.getResponseHeader('Content-Length'), 10);
          resolve(info);
        }
      };
      xhr.send();
    });
  },


  getPlayResponse(client, url, queue, msg) {
    return new Promise((resolve) => {
      youtubedl.getInfo(url, (err, info) => {
        if (err) msg.channel.send(`There was an error getting video info: ${err}`);
        try {
          let length;
          let uploader;
          let likes;
          let dislikes;
          let views;
          let thumbnail;
          let filters;

          if (!info._duration_hms) length = 'N/A';
          else length = info._duration_hms;

          if (!info.thumbnail) thumbnail = msg.author.avatarURL({ size: 1024 });
          else thumbnail = info.thumbnail;

          if (!info.uploader) uploader = `${queue[0].author} (Not found)`;
          else uploader = info.uploader;

          if (!info.like_count) likes = 'N/A';
          else likes = info.like_count;

          if (!info.dislike_count) dislikes = 'N/A';
          else dislikes = info.dislike_count;

          if (!info.view_count) views = 'N/A';
          else views = info.view_count;

          if (!queue[0].usesFfmpeg) filters = 'None';
          else filters = queue[0].usesFfmpeg.join(', ');

          const embed = {
            color: 7506394,
            title: 'Playing song',
            description: `Requested by ${queue[0].author}`,
            thumbnail: {
              url: thumbnail,
            },
            fields: [{
              name: 'Title',
              value: info.title,
              inline: false,
            }, {
              name: 'Length',
              value: length,
              inline: false,
            }, {
              name: 'Uploaded By',
              value: uploader,
              inline: false,
            }, {
              name: 'Video Stats',
              value: `Likes: ${likes} Dislikes: ${dislikes} Views: ${views}`,
              inline: false,
            }, {
              name: 'Filters',
              value: filters,
              inline: false,
            },
            ],
          };
          resolve(embed);
        } catch (e) { console.log(`[ERROR] Failed to get info for nowPlaying response! ${e}`); }
      });
    });
  },

  fileExists(path) {
    return new Promise((resolve) => {
      fs.stat(path, (err, stats) => {
        if (err) resolve(false);
        else resolve(true);
      });
    });
  },

  logError(client, msg, title, message) {
    const vars = [];
    const vc = msg.guild.voiceConnection;
    let d;
    if (vc) d = msg.guild.voiceConnection.dispatcher;
    else d = 'NO DISPATCHER';
    vars.push(`Queue: ${mainModule.queue[msg.guild.id]}`, `Voice Connection: ${vc}`, `Voice Dispatcher: ${d}`, `Message Author: ${msg.author.tag}`);
    client.channels.get(CONFIG.errorLog).send({
      embed: {
        color: 11736341,
        title,
        description: message,
        fields: [{
          name: `Error in guild: ${msg.guild.name}`,
          value: `ID: ${msg.guild.id}`,
          inline: false,
        }, {
          name: 'Variables',
          value: vars.join('\n'),
          inline: false,
        }],
        thumbnail: {
          url: msg.author.avatarURL({ size: 2048 }),
        },
        timestamp: new Date(),
      },
    });
  },

  logCriticalError(client, message) {
    return new Promise((resolve) => {
      client.channels.get(CONFIG.errorLog).send({
        embed: {
          color: 11736341,
          title: 'CRITICAL ERROR',
          description: 'An error occurred and the bot will be restarted',
          fields: [{
            name: 'Error',
            value: message,
            inline: false,
          }, {
            name: 'Time of restart',
            value: `${new Date().toTimeString()} ${new Date().toDateString()}`,
            inline: false,
          }],
          timestamp: new Date(),
        },
      });
    });
  },
};
