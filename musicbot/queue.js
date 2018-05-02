"use strict";
const CONFIG = require("../config.json");
const youtubedl = require('youtube-dl');
const utils = require("./utils.js");
const mainModule = require("../bot.js");
const player = require("./player.js");
const downloader = require("./downloader.js");

let maxFileSize = 536870912;

module.exports = {
  addToQueue: async function (client, msg, songUrl, usesFfmpeg) {
    let newSongUrl;
    // I hate this hack.
    if (songUrl.startsWith("https://youtu.be") || songUrl.startsWith("http://youtu.be")) newSongUrl = "https://www.youtube.com/watch?v=" + utils.getId(songUrl);
    else newSongUrl = songUrl;
    console.log("NEW URL " + newSongUrl);

    let linkInfo = await utils.checkLink(newSongUrl);
    if (linkInfo.size > maxFileSize && !isNaN(fileSize)) {
      utils.sendResponse(msg, "Your song is too big to download. Your song: `" + size + " Bytes` Max size: `" + maxFileSize + " Bytes`", "err");
      return;
    }
    if (!CONFIG.supportedMime.includes(linkInfo.type)) {
      if (!linkInfo.type.includes("audio") && !linkInfo.type.includes("video")) {
        utils.sendResponse(msg, "This MIME type is not supported. If you believe it should be, ask the owner to add it to the list of supported MIME types. Type: `" + linkInfo.type + "`", "err");
        return;
      }
    }
    youtubedl.getInfo(newSongUrl, (err, info) => {
      if (err) {
        utils.sendResponse(msg, "YTDL ERROR: " + err, "err");
        return;
      }

      if (Array.isArray(info)) {
        if (info.length > CONFIG.maxPlaylistSize && !utils.checkPermission(msg.author, msg, "owner")) {
          utils.sendResponse(msg, "That playlist is too long. Max is: " + CONFIG.maxPlaylistSize + " videos", "err");
          return;
        }
        utils.sendResponse(msg, "Processing playlist...", "info");
        for (let i = 0; i < info.length; i++) {
          let length;
          if (!info[i]._duration_hms) length = "N/A";
          else length = info._duration_hms;
          mainModule.queue[msg.guild.id].push({
            title: info[i].title,
            link: info[i].webpage_url,
            author: msg.author.tag,
            filename: info[i]._filename,
            filesize: info[i].size,
            length: length,
            usesFfmpeg: usesFfmpeg
          });
        }
      }
      else {

        let length;
        let uploader;
        let likes;
        let dislikes;
        let views;
        let thumbnail;

        if (!info._duration_hms) length = "N/A";
        else length = info._duration_hms;

        if (!info.thumbnail) thumbnail = msg.author.avatarURL({size: 2048});
        else thumbnail = info.thumbnail;

        if (!info.uploader) uploader = msg.author.tag + " (Not found)";
        else uploader = info.uploader;

        if (!info.like_count) likes = "N/A";
        else likes = info.like_count;

        if (!info.dislike_count) dislikes = "N/A";
        else dislikes = info.dislike_count;

        if (!info.view_count) views = "N/A";
        else views = info.view_count;

        mainModule.queue[msg.guild.id].push({ // Add the song to the queue
          title: info.title,
          link: newSongUrl,
          author: msg.author.tag,
          filename: info._filename,
          filesize: info.size,
          length: length,
          uploader: uploader,
          likes: likes,
          dislikes: dislikes,
          views: views,
          thumbnail: thumbnail,
          usesFfmpeg: usesFfmpeg
        });
      }
      if (/*!msg.guild.voiceConnection.speaking*/ !mainModule.queue[msg.guild.id].queueing && mainModule.queue[msg.guild.id].firstSong) {
        // Okay, so I'm really stupid so im going to explain what this thing ^^^^ does.
        // This checks to see if the bot is SPEAKING (playing music) OR its queueing a song. Queuing a song is the worst variable name. Here's why.
        // That's just to show that this is not the first song in the queue, so do not try to auto-play it. We have to check both because we don't want to start the next song if it's already playing (speaking)
        // We also dont want to start the next song if it's not the first song in the queue, so we check both. We also have to check to make sure the dispatcher isn't paused so songs can be queued while the dispatcher is paused.
        // This is probably the most hacked and most broken part of the queue.
        // lmao this is old and doesnt matter anymore
        // TODO: fix this shit
        if (msg.guild.voiceConnection && msg.guild.voiceConnection.dispatcher && msg.guild.voiceConnection.dispatcher.paused) {
          mainModule.queue[msg.guild.id] = [];
          mainModule.queue[msg.guild.id].queueing = false;
          mainModule.queue[msg.guild.id].playing = false;
          mainModule.queue[msg.guild.id].firstSong = true;
          return;
        }
        mainModule.queue[msg.guild.id].firstSong = false;
        mainModule.queue[msg.guild.id].queueing = true; // Now its set to queueing because it is
        this.playNextSong(client, msg); // Now we play the next song
      }
      else {
        youtubedl.getInfo(newSongUrl, function (err, info) {
          if (err) utils.sendResponse(msg, "There was an error getting video info: " + err, "err");
          if (Array.isArray(info)) return;
          let length;
          let thumbnail;
          if (!info.thumbnail) thumbnail = msg.author.avatarURL({size: 2048});
          else thumbnail = info.thumbnail;
          if (!info._duration_hms) length = "N/A";
          else length = info._duration_hms;
          let embed = {
            color: 7506394,
            title: "Added song to queue",
            description: "Requested by " + msg.author.tag,
            thumbnail: {
              url: thumbnail
            },
            fields: [{
              name: "Title",
              value: info.title,
              inline: false
            }, {
              name: "Length",
              value: length,
              inline: false
            }, {
              name: "Position in queue", //TODO: make this better, if multiple songs are queued, they all have the same "position" because we're just using the length of the array.
              value: mainModule.queue[msg.guild.id].length - 1,
              inline: false
            }
            ]
          };
          msg.channel.send("", {embed});
        });
      }
    });
  },

  playNextSong: function (client, msg) {
    mainModule.queue[msg.guild.id].skips = 0;
    mainModule.queue[msg.guild.id].skippers = [];
    if (mainModule.queue[msg.guild.id].playing && !mainModule.queue[msg.guild.id].loop) this.removeFromQueue(mainModule.queue[msg.guild.id], 0); // If its currently playing we remove the first song (currently playing) because that means that its over
    player.playSong(client, msg, mainModule.queue[msg.guild.id]); // Now we play the next song
  },

  removeFromQueue: function (queue, index) {
    queue.splice(index, 1);
  }
};