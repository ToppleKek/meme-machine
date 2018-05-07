const CONFIG = require('./config.json');
const Discord = require('discord.js');
const utils = require('./musicbot/utils.js');
const queueUtils = require('./musicbot/queue.js');
const commandHandler = require('./musicbot/commandHandler.js');
const validUrl = require('valid-url');
const ytSearch = require('youtube-search');
const fs = require('fs');
const youtubedl = require('youtube-dl'); // This is just for use with eval
const { exec } = require('child_process');
const downloader = require('./musicbot/downloader');

// TODO catch some promises

const client = new Discord.Client({ autoReconnect: true, disableEveryone: true });
const commands = {};
const validFilters = ['bass', 'echo', 'ftempo', 'stempo', 'fspeed', 'sspeed', 'vibrato']; // Put this in config?
const opts = {
  maxResults: 10,
  type: 'video',
  key: CONFIG.googlekey,
};

module.exports.queue = {};

// ---FUNCTIONS---

function secondsToHms(d) {
  d = Number(d);

  const h = Math.floor(d / 3600);
  const m = Math.floor(d % 3600 / 60);
  const s = Math.floor(d % 3600 % 60);

  return `${(`0${h}`).slice(-2)}:${(`0${m}`).slice(-2)}:${(`0${s}`).slice(-2)}`;
}

function arrayContainsArray(superset, subset) {
  if (subset.length === 0) return false;
  return subset.every(value => superset.indexOf(value) >= 0);
}

// ---COMMANDS---

commands.help = {};
commands.help.help = 'Displays this list';
commands.help.main = (msg, hasArgs) => {
  const cmds = [];

  // Lol this works just fine so shut up eslint I'll do what I want >:(
  for (const command in commands) cmds.push(`**${CONFIG.prefix}${command}** - ${commands[command].help}`);

  const embed = {
    color: 0xED5228,
    title: 'List of commands',
    description: `Prefix: \`${CONFIG.prefix}\` You may also mention me as a prefix.\n\n${cmds.join('\n')}`,
    timestamp: new Date(),
  };
  msg.channel.send('', { embed }).catch(err => utils.sendResponse(msg, `ERROR: ${err}`, 'err'));
};

commands.ping = {};
commands.ping.help = 'Pong!';
commands.ping.main = (msg, hasArgs) => {
  const ping = Date.now() - msg.createdAt.getTime();
  utils.sendResponse(msg, `Pong! \`${ping}ms\``, 'success');
};

commands.info = {};
commands.info.help = 'Stats and other information';
commands.info.main = (msg, hasArgs) => {
  const usedMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const embed = {
    color: 0xED5228,
    title: 'Stats',
    description: `Memory usage: ${Math.round(usedMem * 100) / 100} MB\
    \nGitHub: https://github.com/ToppleKek/meme-machine\
    \nOwner: ${client.users.get(CONFIG.ownerid).tag}`,
    timestamp: new Date(),
  };
  msg.channel.send('', { embed }).catch(err => utils.sendResponse(msg, `ERROR: ${err}`, 'err'));
};

commands.setgame = {};
commands.setgame.help = 'Sets the now playing status of the bot (Owner only)';
commands.setgame.main = (msg, hasArgs) => {
  if (utils.checkPermission(msg.author, msg, 'owner')) {
    if (hasArgs) {
      const gameStr = msg.content.split(' ');
      const type = gameStr[0];
      gameStr.shift();
      const game = gameStr.join(' ');

      if (type !== 'playing' && type !== 'listening' && type !== 'watching') utils.sendResponse(msg, 'Game must be prefixed with playing, watching or listening.', 'err');
      else {
        utils.setGame(client, game, type);
        utils.sendResponse(msg, `Set game to: \`${type} ${game}\``, 'success');
      }
    } else utils.sendResponse(msg, `Argument error. Usage: \`${CONFIG.prefix}setgame [playing|watching|listening] really cool game\``, 'err');
  } else utils.sendResponse(msg, 'Only the owner can use this command.', 'err');
};

commands.evaljs = {};
commands.evaljs.help = 'Evaluate JavaScript (Owner only)';
commands.evaljs.main = (msg, hasArgs) => {
  if (utils.checkPermission(msg.author, msg, 'owner')) {
    if (hasArgs) {
      const code = msg.content;
      let out;
      try {
        out = eval(code);
        console.log(`[EVAL] ${out}`);
      } catch (error) {
        msg.channel.send({
          embed: {
            color: 11736341,
            author: {
              name: 'Eval Error',
            },
            title: 'An Exception Occurred!',
            fields: [{
              name: 'Error Name:',
              value: error.name,
            },
            {
              name: 'Error Message:',
              value: error.message,
            },
            ],
            timestamp: new Date(),
          },
        }); // end send message
        return;
      } // end catch
      msg.channel.send(out).catch(error => msg.channel.send(`UNCAUGHT EXCEPTION(Failed promise)\n${error.name}\n${error.message}`));
    } else utils.sendResponse(msg, `Argument error. Usage: \`${CONFIG.prefix}evaljs some really cool code\``, 'err');
  } else utils.sendResponse(msg, 'Only the owner can use this command.', 'err');
};

commands.summon = {};
commands.summon.help = 'Brings the bot to your voice channel';
commands.summon.main = (msg, hasArgs) => {
  if (!msg.guild) return;
  if (msg.member.voiceChannel) {
    if (!exports.queue[msg.guild.id]) {
      // Queue setup
      exports.queue[msg.guild.id] = [];
      exports.queue[msg.guild.id].playing = false;
      exports.queue[msg.guild.id].queueing = false;
      exports.queue[msg.guild.id].firstSong = true;
      exports.queue[msg.guild.id].loop = false;
      exports.queue[msg.guild.id].volume = 50;
      exports.queue[msg.guild.id].skips = 0;
      exports.queue[msg.guild.id].skippers = [];
      exports.queue[msg.guild.id].searching = [];
      console.log(exports.queue);
    }
    msg.member.voiceChannel.join().catch(err => console.log(err));
  } else {
    utils.sendResponse(msg, 'You must be in a voice channel!', 'err');
  }
};

commands.disconnect = {};
commands.disconnect.help = 'Makes the bot leave the voice channel';
commands.disconnect.main = (msg, hasArgs) => {
  if (!msg.guild) return;
  if (!utils.checkPermission(msg.author, msg, 'admin')) {
    utils.sendResponse(msg, 'You do not have permission to use that command. You are missing permission `ADMINISTRATOR`', 'err');
    return;
  }
  if (!msg.guild.voiceConnection) {
    utils.sendResponse(msg, 'The bot is not in a voice channel', 'err');
    return;
  }
  const connection = msg.guild.voiceConnection;
  exports.queue[msg.guild.id].splice(1);
  if (connection.dispatcher) connection.dispatcher.end();
  connection.channel.leave();
  // This little hack here is a workaround for issue #2443
  // HAHA LOL FUCK YOU ISSUE #2443 I FIXED IT
  /*
  setTimeout(function () {
    queue[msg.guild.id].playing = false;
    queue[msg.guild.id].queueing = false;
    queue[msg.guild.id].firstSong = true;
    queue[msg.guild.id].loop = false;
    connection.channel.leave();
  }, 100);
  */
};

commands.play = {};
commands.play.help = 'Plays music or smth';
commands.play.main = (msg, hasArgs) => {
  if (!msg.guild) return;
  if (!msg.guild.voiceConnection) {
    utils.sendResponse(msg, `The bot must be in a voice channel (and a connection to the voice channel must be made). Summon it with ${CONFIG.prefix}summon`, 'err');
    return;
  }
  if (!hasArgs && !msg.attachments.first()) {
    utils.sendResponse(msg, 'You must provide a video link or text to search for', 'err');
    return;
  }
  if (msg.attachments.first()) {
    msg.channel.startTyping();
    queueUtils.addToQueue(client, msg, msg.attachments.first().url, false);
    msg.channel.stopTyping();
    return;
  }
  if (validUrl.isUri(msg.content)) {
    const connection = msg.guild.voiceConnection;
    if (connection.speaking) {
      queueUtils.addToQueue(client, msg, msg.content, false);
    } else {
      msg.channel.startTyping();
      queueUtils.addToQueue(client, msg, msg.content, false);
      msg.channel.stopTyping();
    }
  } else {
    msg.channel.startTyping();
    ytSearch(msg.content, opts, (err, results) => {
      if (err) {
        utils.sendResponse(msg, `There was an error searching youtube: ${err}`, 'err');
        msg.channel.stopTyping();
      } else {
        queueUtils.addToQueue(client, msg, results[0].link, false);
        msg.channel.stopTyping();
      }
    });
  }
};

commands.volume = {};
commands.volume.help = 'Sets the volume of the player';
commands.volume.main = (msg, hasArgs) => {
  if (!msg.guild) return;
  if (utils.checkPermission(msg.author, msg, 'admin')) {
    if (!exports.queue[msg.guild.id] || !msg.guild.voiceConnection.dispatcher) {
      const vol = Number(msg.content);
      if (Number.isNaN(vol)) {
        utils.sendResponse(msg, 'That is not a number. Please provide a valid number between 1 and 2000', 'err');
        return;
      }
      if (vol < 1 || vol > 2000) {
        utils.sendResponse(msg, 'Please provide a number between 1 and 2000', 'err');
        return;
      }
      exports.queue[msg.guild.id].volume = vol;
      utils.sendResponse(msg, `Set volume to: ${vol}%`, 'success');
    } else {
      const connection = msg.guild.voiceConnection;
      const dispatcher = connection.dispatcher;
      if (!hasArgs) utils.sendResponse(msg, `Current volume: ${dispatcher.volume * 100}%`, 'info');
      else {
        const vol = Number(msg.content);
        if (Number.isNaN(vol)) {
          utils.sendResponse(msg, 'That is not a number. Please provide a valid number between 1 and 2000', 'err');
          return;
        }
        if (vol < 1 || vol > 2000) {
          utils.sendResponse(msg, 'Please provide a number between 1 and 2000', 'err');
          return;
        }
        dispatcher.setVolume(vol / 100);
        exports.queue[msg.guild.id].volume = vol;
        utils.sendResponse(msg, `Set volume to: ${vol}%`, 'success');
      }
    }
  } else utils.sendResponse(msg, 'You do not have permission to use that command. You are missing permission `ADMINISTRATOR`', 'err');
};

commands.pause = {};
commands.pause.help = 'Pauses playback';
commands.pause.main = (msg, hasArgs) => {
  if (!msg.guild) return;
  if (utils.checkPermission(msg.author, msg, 'owner') || utils.checkPermission(msg.author, msg, 'voice')) {
    if (msg.guild.voiceConnection.dispatcher.paused) {
      utils.sendResponse(msg, 'The player is already paused', 'err');
      return;
    }
    if (msg.guild.voiceConnection.speaking) {
      msg.guild.voiceConnection.dispatcher.pause();
      utils.sendResponse(msg, 'Paused playback', 'success');
    } else utils.sendResponse(msg, 'The player is not playing', 'err');
  } else utils.sendResponse(msg, 'You do not have permission to pause playback. Reason: You are not in the voice chat.', 'err');
};

commands.resume = {};
commands.resume.help = 'Pauses playback';
commands.resume.main = (msg, hasArgs) => {
  if (!msg.guild) return;
  if (utils.checkPermission(msg.author, msg, 'owner') || utils.checkPermission(msg.author, msg, 'voice')) {
    if (msg.guild.voiceConnection.dispatcher && msg.guild.voiceConnection.dispatcher.paused) {
      msg.guild.voiceConnection.dispatcher.resume();
      utils.sendResponse(msg, 'Resumed playback', 'success');
    } else utils.sendResponse(msg, 'The player is not paused', 'err');
  } else utils.sendResponse(msg, 'You do not have permission to resume playback. Reason: You are not in the voice chat.', 'err');
};

commands.skip = {};
commands.skip.help = 'Skips song';
commands.skip.main = (msg, hasArgs) => {
  if (utils.checkPermission(msg.author, msg, 'voice') || utils.checkPermission(msg.author, msg, 'owner') || utils.checkPermission(msg.author, msg, 'admin')) {
    if (!msg.guild.voiceConnection.speaking) {
      utils.sendResponse(msg, 'The bot is not playing', 'err');
    } else {
      // Needs half of the people to voteskip (minus the bot itself and rounded)
      const totalVoiceMembers = msg.guild.voiceConnection.channel.members.array().length;
      const requiredVotes = Math.round((totalVoiceMembers - 1) / 2);
      if (exports.queue[msg.guild.id].skippers.includes(msg.author.id)) utils.sendResponse(msg, `You have already voted \`${exports.queue[msg.guild.id].skips}/${requiredVotes}\``, 'err');
      else {
        exports.queue[msg.guild.id].skips += 1;
        if (exports.queue[msg.guild.id].skips >= requiredVotes) {
          exports.queue[msg.guild.id].loop = false;
          msg.guild.voiceConnection.dispatcher.end();
          utils.sendResponse(msg, 'Vote passed, skipped song', 'success');
        } else {
          exports.queue[msg.guild.id].skippers.push(msg.author.id);
          utils.sendResponse(msg, `Your vote has been counted \`${exports.queue[msg.guild.id].skips}/${requiredVotes}'\``, 'success');
        }
      }
    }
  }
};

commands.np = {};
commands.np.help = 'Shows the currently playing song';
commands.np.main = (msg, hasArgs) => {
  if (!exports.queue[msg.guild.id] || !msg.guild.voiceConnection || !msg.guild.voiceConnection.dispatcher) utils.sendResponse(msg, 'The bot is not playing', 'err');
  else {
    const time = msg.guild.voiceConnection.dispatcher.streamTime / 1000;
    let totalVideoTime;
    let filters;

    if (exports.queue[msg.guild.id][0].usesFfmpeg) totalVideoTime = `${exports.queue[msg.guild.id][0].length} (There are filters, time may be inaccurate)`;
    else totalVideoTime = exports.queue[msg.guild.id][0].length;

    if (!exports.queue[msg.guild.id][0].usesFfmpeg) filters = 'None';
    else filters = exports.queue[msg.guild.id][0].usesFfmpeg.join(', ');

    const embed = {
      color: 7506394,
      title: 'Currently playing',
      description: `Requested by ${exports.queue[msg.guild.id][0].author}`,
      fields: [{
        name: 'Title',
        value: exports.queue[msg.guild.id][0].title,
        inline: false,
      }, {
        name: 'Progress',
        value: `${secondsToHms(time)}/${totalVideoTime}`,
        inline: false,
      }, {
        name: 'Filters',
        value: filters,
        inline: false,
      }
      ],
    };
    msg.channel.send('', { embed });
  }
};

commands.queue = {};
commands.queue.help = 'Displays the queue';
commands.queue.main = (msg, hasArgs) => {
  if (!exports.queue[msg.guild.id] || exports.queue[msg.guild.id].length < 1) utils.sendResponse(msg, 'The queue is empty', 'err');
  else {
    const songs = [];
    let maxEntries;
    if (exports.queue[msg.guild.id].length > 15) maxEntries = 15;
    else maxEntries = exports.queue[msg.guild.id].length;
    for (let i = 0; i < maxEntries; i += 1) {
      songs.push(`\`${i}.\` - **${exports.queue[msg.guild.id][i].title}** Added by: **${exports.queue[msg.guild.id][i].author}**`);
    }
    if (exports.queue[msg.guild.id].length > 15) songs.push(`\n\n***And ${(exports.queue[msg.guild.id].length - 15)} more***`);

    const embed = {
      color: 7506394,
      title: 'Queue',
      description: songs.join('\n'),
    };

    msg.channel.send('', { embed });
  }
};

commands.status = {};
commands.status.help = 'Status of the download (Owner only)';
commands.status.main = (msg, hasArgs) => {
  if (!utils.checkPermission(msg.author, msg, 'owner')) utils.sendResponse(msg, 'Only the owner can use this command', 'err');
  else {
    const stats = fs.statSync(`./audio_cache/${exports.queue[msg.guild.id][0].filename}.part`);
    const statsInMb = (stats.size / 1048576).toFixed(2);
    utils.sendResponse(msg, `Status of download: ${statsInMb}MB Downloaded`, 'info');
  }
};

commands.clear = {};
commands.clear.help = 'Clears the queue';
commands.clear.main = (msg, hasArgs) => {
  if (utils.checkPermission(msg.author, msg, 'admin')) {
    exports.queue[msg.guild.id].splice(1);
    utils.sendResponse(msg, 'Cleared queue', 'success');
  } else utils.sendResponse(msg, 'You do not have permission to use that command. You are missing permission `ADMINISTRATOR`', 'err');
};

commands.blacklist = {};
commands.blacklist.help = 'Blacklist a user from the bot (Owner only)';
commands.blacklist.main = (msg, hasArgs) => {
  if (!utils.checkPermission(msg.author, msg, 'owner')) {
    utils.sendResponse(msg, 'Only the owner can use that command', 'err');
    return;
  }
  let userToBlacklist;
  if (!hasArgs) utils.sendResponse(msg, 'You must provide a user mention or ID to blacklist!', 'err');
  else if (msg.mentions.users.first()) userToBlacklist = msg.mentions.users.first().id;
  else if (client.users.get(msg.content).id) userToBlacklist = msg.content;
  else utils.sendResponse(msg, 'That is not a valid UserID or mention', 'err');
  if (userToBlacklist) {
    if (CONFIG.blacklisted.includes(userToBlacklist)) {
      CONFIG.blacklisted.splice(CONFIG.blacklisted.indexOf(userToBlacklist), 1);
      fs.writeFile('./config.json', JSON.stringify(CONFIG, null, 2), (err) => {
        if (err) console.log(err);
        console.log('[INFO] Updating blacklisted users');
      });
      utils.sendResponse(msg, 'Removed user from blacklist', 'success');
    } else {
      CONFIG.blacklisted.push(userToBlacklist);
      fs.writeFile('./config.json', JSON.stringify(CONFIG, null, 2), (err) => {
        if (err) console.log(err);
        console.log('[INFO] Updating blacklisted users');
      });
      utils.sendResponse(msg, 'Added user to blacklist', 'success');
    }
  }
};

commands.search = {};
commands.search.help = 'Search Youtube for a video and play it';
commands.search.main = (msg, hasArgs) => {
  if (!utils.checkPermission(msg.author, msg, 'voice') && !utils.checkPermission(msg.author, msg, 'owner')) {
    utils.sendResponse(msg, 'You do not have permission to search. Reason: you are not in the voice chat', 'err');
    return;
  }
  if (!msg.guild.voiceConnection) {
    utils.sendResponse(msg, `The bot must be in a voice channel (and a connection to the voice channel must be made). Summon it with ${CONFIG.prefix}summon`, 'err');
    return;
  }
  if (!hasArgs) utils.sendResponse(msg, 'You must provide text to search for', 'err');
  else {
    msg.channel.startTyping();
    ytSearch(msg.content, opts, (err, results) => {
      if (err) {
        utils.sendResponse(msg, `There was an error searching youtube: ${err}`, 'err');
        msg.channel.stopTyping();
      } else {
        const vids = [];
        const originalAuth = msg.author;
        let gotVid = false;
        if (exports.queue[msg.guild.id].searching.includes(msg.author.id)) {
          msg.channel.stopTyping();
          return;
        }
        if (results.length === 0) {
          utils.sendResponse(msg, 'No search results', 'err');
          return;
        }
        exports.queue[msg.guild.id].searching.push(msg.author.id);

        for (let i = 0; i < results.length; i += 1) vids.push(`\`${(i + 1)}.\` **${results[i].title}**`);
        const embed = {
          color: 7506394,
          title: 'Search results',
          description: vids.join('\n'),
          footer: {
            text: 'Reply with "exit" to stop searching',
            iconURL: client.user.avatarURL(),
          },
        };
        msg.channel.send('', { embed });
        msg.channel.stopTyping();
        const collector = msg.channel.createMessageCollector(m => m, { time: 30000 });
        collector.on('collect', (m) => {
          if (m.author === originalAuth && m.content === 'exit') collector.stop();
          const num = Number(m.content);
          if (m.author === originalAuth && !Number.isNaN(num)) {
            if (num > results.length) return;
            queueUtils.addToQueue(client, msg, results[num - 1].link, false);
            utils.sendResponse(msg, 'Coming right up', 'success');
            gotVid = true;
            const toSplice = exports.queue[msg.guild.id].searching.indexOf(msg.author.id);
            exports.queue[msg.guild.id].searching.splice(toSplice, 1);
            collector.stop();
          }
        });
        collector.on('end', (col) => {
          const toSplice = exports.queue[msg.guild.id].searching.indexOf(msg.author.id);
          exports.queue[msg.guild.id].searching.splice(toSplice, 1);
          if (!gotVid) utils.sendResponse(msg, 'Gave up searching', 'info');
          msg.channel.stopTyping();
        });
      }
    });
  }
};

commands.loop = {};
commands.loop.help = 'Toggle loop on currently playing song';
commands.loop.main = (msg, hasArgs) => {
  if (!msg.guild.voiceConnection) {
    utils.sendResponse(msg, `The bot must be in a voice channel (and a connection to the voice channel must be made). Summon it with ${CONFIG.prefix}summon`, 'err');
    return;
  }
  if (!msg.guild.voiceConnection.dispatcher) {
    utils.sendResponse(msg, 'The bot is not playing', 'err');
    return;
  }
  if (!utils.checkPermission(msg.author, msg, 'voice') && !utils.checkPermission(msg.author, msg, 'admin')) utils.sendResponse(msg, 'You do not have permission to loop this song. Reason: you are not in the voice channel', 'err');
  else if (exports.queue[msg.guild.id].loop) {
    exports.queue[msg.guild.id].loop = false;
    utils.sendResponse(msg, 'Disabled loop mode');
  } else {
    exports.queue[msg.guild.id].loop = true;
    utils.sendResponse(msg, 'Enabled loop mode');
  }
};

commands.addtype = {};
commands.addtype.help = 'Add a MIME type to the supported types list (Owner only)';
commands.addtype.main = (msg, hasArgs) => {
  if (!utils.checkPermission(msg.author, msg, 'owner')) {
    utils.sendResponse(msg, 'Only the owner can use this command', 'err');
    return;
  }
  if (!hasArgs) utils.sendResponse(msg, 'You must provide a MIME type', 'err');
  else {
    CONFIG.supportedMime.push(msg.content);
    fs.writeFile('./config.json', JSON.stringify(CONFIG, null, 2), (err) => {
      if (err) console.log(err);
      console.log('[INFO] Updating MIME types');
      utils.sendResponse(msg, 'Added MIME type', 'success');
    });
  }
};

commands.adminskip = {};
commands.adminskip.help = 'Skips song';
commands.adminskip.main = (msg, hasArgs) => {
  if (!msg.guild) return;
  if (utils.checkPermission(msg.author, msg, 'admin') || utils.checkPermission(msg.author, msg, 'owner')) {
    if (!msg.guild.voiceConnection.speaking) {
      utils.sendResponse(msg, 'The bot is not playing', 'err');
    } else {
      exports.queue[msg.guild.id].loop = false;
      msg.guild.voiceConnection.dispatcher.end();
      utils.sendResponse(msg, 'Skipped song', 'success');
    }
  } else utils.sendResponse(msg, 'You do not have permission to use that command. You are missing permission `ADMINISTRATOR`', 'err');
};

commands.fplay = {};
commands.fplay.help = 'Play a song with a filter';
commands.fplay.main = (msg, hasArgs) => {
  if (!msg.guild.voiceConnection) {
    utils.sendResponse(msg, `The bot must be in a voice channel (and a connection to the voice channel must be made). Summon it with ${CONFIG.prefix}summon`, 'err');
    return;
  }
  if (!hasArgs && !msg.attachments.first()) {
    utils.sendResponse(msg, `You must provide a valid filter and a video link/text to search for (Ex. ${CONFIG.prefix}fplay bass|cool music) (Notice the |)`, 'err');
    return;
  }

  if (!msg.content.includes('|')) {
    utils.sendResponse(msg, `Incorrect formatting. Usage: ${CONFIG.prefix}fplay <filters separated by spaces>|<text to search for/video link>`, 'err');
    return;
  }

  const filter = msg.content.split('|')[0];
  const filters = filter.split(' ');

  if ((filter.match(/bass/g) || []).length > 5) {
    utils.sendResponse(msg, 'Too much bass! Adding too much causes ffmpeg to crash. Please use less than 5', 'err');
    return;
  }

  /*
  const vibratoCheck = filter.indexOf('vibrato');
  if (vibratoCheck !== -1 && filters.length > 1) {
    utils.sendResponse(msg, 'When using the vibrato filter, no other filters can be used (ffmpeg will crash) Please use only vibrato', 'err');
    return;
  }
  */

  if (!arrayContainsArray(validFilters, filters)) {
    utils.sendResponse(msg, `Invalid filter. Valid filters are: ${validFilters.join(', ')}`, 'err');
    return;
  }

  console.log(filters);
  const strSearchText = msg.content.split('|')[1];
  console.log(strSearchText);

  if (filters.length > CONFIG.maxFilters) {
    utils.sendResponse(msg, `Maximum filters exceeded! Using the first ${CONFIG.maxFilters}`, 'err');
    filters.length = 10;

  }

  if (msg.attachments.first()) {
    msg.channel.startTyping();
    queueUtils.addToQueue(client, msg, msg.attachments.first().url, filters);
    msg.channel.stopTyping();
    return;
  }

  if (validUrl.isUri(strSearchText)) {
    const connection = msg.guild.voiceConnection;
    if (connection.speaking) {
      queueUtils.addToQueue(client, msg, strSearchText, filters);
    } else {
      msg.channel.startTyping();
      queueUtils.addToQueue(client, msg, strSearchText, filters);
      msg.channel.stopTyping();
    }
  } else {
    msg.channel.startTyping();
    ytSearch(strSearchText, opts, (err, results) => {
      if (err) {
        utils.sendResponse(msg, `There was an error searching youtube: ${err}`, 'err');
      } else {
        const connection = msg.guild.voiceConnection;
        if (connection.speaking) queueUtils.addToQueue(client, msg, results[0].link, filters);
        else queueUtils.addToQueue(client, msg, results[0].link, filters);
      }
    });
    msg.channel.stopTyping();
  }
};

commands.guilds = {};
commands.guilds.help = 'Shows a list of all guilds this bot is in';
commands.guilds.main = (msg, hasArgs) => {
  const guilds = client.guilds.array();
  let maxGuilds;
  const shownGuilds = [];

  if (guilds.length > 25) maxGuilds = 25;
  else maxGuilds = guilds.length;

  for (let i = 0; i < maxGuilds; i += 1) shownGuilds.push(`\`-\` **${guilds[i].name}**`);

  if (maxGuilds === 25 && maxGuilds - 25 !== 0) shownGuilds.push(`${`***And ${guilds}` - 25} more***`);

  const embed = {
    title: `In ${guilds.length} guilds`,
    description: shownGuilds.join('\n'),
    color: 7506394,
  };

  msg.channel.send('', { embed });
};

commands.exec = {};
commands.exec.help = 'Execute shell commands (Owner only)';
commands.exec.main = (msg, hasArgs) => {
  if (!utils.checkPermission(msg.author, msg, 'owner')) {
    utils.sendResponse(msg, 'Only the owner can use this command', 'err');
    return;
  }
  if (!hasArgs) utils.sendResponse(msg, 'You must provide a command to execute', 'err');
  else {
    exec(msg.content, (err, stdout, stderr) => {
      if (err) utils.sendResponse(msg, `ERROR: ${err}`, 'err');
      else {
        let error;
        if (!stderr) error = 'N/A';
        else error = stderr;
        const embed = {
          title: `Results of ${msg.content}`,
          fields: [{
            name: 'stdout',
            value: stdout,
          },
          {
            name: 'stderr',
            value: error,
          }],
          color: 7506394,
        };
        msg.channel.send('', { embed }).catch((e) => { utils.sendResponse(msg, `Failed to send message: ${e}`, 'err'); });
      }
    });
  }
};

commands.listfilters = {};
commands.listfilters.help = 'List available filters';
commands.listfilters.main = (msg, hasArgs) => {
  utils.sendResponse(msg, `Filters:\n${validFilters.join('\n')}`, 'info');
};
// ---END COMMANDS---

// ---EVENTS---

client.on('message', (msg) => {
  if (msg.content.startsWith(`<@${client.user.id}>`) || msg.content.startsWith(`<@!${client.user.id}>`)) {
    commandHandler.checkCommand(client, commands, msg, true);
  } else if (msg.content.startsWith(CONFIG.prefix)) {
    commandHandler.checkCommand(client, commands, msg, false);
  }
});

client.on('ready', () => {
  console.log(`Ready. \nClient: ${client.user.tag}\nOwner: ${client.users.get(CONFIG.ownerid).tag}\nServers: ${client.guilds.array().length}`);
});

/*
process.on('uncaughtException', async (err) => {
  console.log(err);
  //await utils.logCriticalError(client, err);
  process.exit(1);
});
*/
// ---END EVENTS---

client.login(CONFIG.token);
