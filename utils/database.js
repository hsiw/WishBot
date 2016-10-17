let mysql = require('mysql'),
    fs = require('fs'),
    options = require('./../options/options.json'),
    guildPrefixes = require('./../database/guildPrefixes.json'), //JSON database of guildPrefixes
    pool = mysql.createPool({
        connectionLimit: 100,
        host: options.database.host,
        port: options.database.port,
        user: options.database.user,
        password: options.database.password,
        database: options.database.database
    });

//Add to or remove from server_settings database

//Add guild to the server_settings database table
function addGuild(guild) {
    return new Promise((resolve, reject) => {
        pool.query('INSERT INTO server_settings SET ?', {
            guild_id: guild.id,
            settings: JSON.stringify({}), //Pass a blank stringified object
            disabled_commands: JSON.stringify({}) //Pass a blank stringified object
        }, err => {
            //Resolve or reject accordingly
            if (err) reject(err);
            else resolve();
        });
    });
}

//Remove guild from the server_settings database table
exports.removeGuild = guild => {
    return new Promise((resolve, reject) => {
        pool.query('DELETE FROM server_settings WHERE guild_id = ' + guild.id, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

//Update server_settings using the passed data
function saveGuild(guild, data) {
    return new Promise((resolve, reject) => {
        pool.query('UPDATE server_settings SET ? WHERE guild_id = ' + guild.id, data, err => {
            if (err) reject(err);
            else resolve();
        })
    });
}

//Ignore Channel Functions

//Add the channel id to the channel_ignores database table and resolve/reject accordingly
exports.ignoreChannel = channel => {
    return new Promise((resolve, reject) => {
        pool.query('INSERT INTO channel_ignores SET channel_id = ' + channel.id, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

//Remove the channel from the channel_ignores database table and resolve/reject accordingly
exports.unignoreChannel = channel => {
    return new Promise((resolve, reject) => {
        pool.query('DELETE FROM channel_ignores WHERE channel_id = ' + channel.id, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

//Check to see if the channel is currently being ignored(if its in the channel_ignores database table)
exports.checkChannel = channel => {
    return new Promise(resolve => {
        pool.query('SELECT * FROM channel_ignores WHERE channel_id = ' + channel.id, (err, result) => {
            if (err || result.length === 0) resolve(); //Resolve if error or if no result returned(not ignored)
        });
    });
}

//Toggle Command Functions

//Toggle commands that are passed to the function(takes a guild and command name)
function toggleCommand(guild, command) {
    return new Promise(resolve => {
        pool.query('SELECT * FROM server_settings WHERE guild_id = ' + guild.id, (err, result) => {
            if (err) console.log(err)
            else if (result.length === 0) addGuild(guild).then(() => toggleCommand(guild, command).then(action => resolve(action))) //If not in database add to database then toggle command
            else {
                let toggled = true; //Set to false if something toggled to false otherwise otherwise
                if (result[0].disabled_commands !== undefined) { //If disabled commands exists
                    var disabled = JSON.parse(result[0].disabled_commands);
                    //If command already disabled re-enable it
                    if (disabled.hasOwnProperty(command)) delete disabled[command];
                    else {
                        disabled[command] = true; //Setting to true disables it(yes its weird but it works)
                        toggled = false;
                    }
                } else { //If disabled commands doesn't exist(shouldn't normally happen)
                    var disabled = {};
                    disabled[command] = true;
                    toggled = false;
                }
                //Save guild with new disabled commands stuff
                saveGuild(guild, {
                    disabled_commands: JSON.stringify(disabled)
                }).then(() => resolve(`Sucessfully toggled \`${command}\` to \`${toggled}\``))
            }
        });
    });
}

//Check to see if a command is currently toggled
exports.checkCommand = (guild, command) => {
    return new Promise((resolve, reject) => {
        if (guild === undefined) resolve(); //If not used in a guild resolve because commands cannot be toggled in DM's
        else {
            pool.query('SELECT disabled_commands FROM server_settings WHERE guild_id = ' + guild.id, (err, result) => {
                if (err || result.length === 0) resolve(); //If error or no result resolve
                else {
                    let disabled = JSON.parse(result[0].disabled_commands) ? JSON.parse(result[0].disabled_commands) : null;
                    if (disabled !== null && disabled[command] !== undefined) reject(); //Command disabled so reject
                    else resolve(); //If there are disabled commands but this isn't one of them, resolve
                }
            });
        }
    });
}
exports.toggleCommand = toggleCommand;

//Welcome/leave/tableflip Settings Functions

//Toggle setting on/off
function toggleSetting(guild, settingChange, message, channel) {
    return new Promise(resolve => {
        pool.query('SELECT * FROM server_settings WHERE guild_id = ' + guild.id, (err, result) => {
            if (err) console.log(err) //If error log error
            else if (result.length === 0) addGuild(guild).then(() => toggleSetting(guild, settingChange, message, channel).then(action => resolve(action))) //If no result returned add to database then toggle setting
            else {
                settingChange = settingChange.toLowerCase(); //Converts settingsChange to lowercase for ease of use
                var toggled = false, //Changes depending on if something is toggled or not
                    usageChannel = result[0].channel_id !== undefined ? result[0].channel_id : channel.id, //Gets the channel id from the database if it exists otherwise sets current channel as it
                    serverSettings = result[0].settings !== undefined ? JSON.parse(result[0].settings) : {}; //Gets settings from database if it exists otherwise sets empty object
                if (settingChange === 'tableflip') { //Toggles automatic table unflipping
                    if (serverSettings.hasOwnProperty('tableflip')) delete serverSettings.tableflip; //Toggles off
                    else { //Toggles on
                        serverSettings['tableflip'] = true;
                        toggled = true;
                    }
                } else if (settingChange === 'welcome') { //Sets and toggles welcome message on
                    if (message) { //If theres a message
                        serverSettings.welcome = message; //Sets the welcome message as the passed message variable
                        toggled = true;
                        usageChannel = channel.id; //Sets the usagechannel as the channel in which the command is used
                    } else delete serverSettings.welcome; //Disables welcome message
                } else if (settingChange === 'leave') { //Sets and toggles leave message on
                    if (message) { //If theres a message
                        serverSettings.leave = message; //Sets leave message as the passed message variable
                        toggled = true;
                        usageChannel = channel.id; //Sets usagechannel as the channel in which the command is used
                    } else delete serverSettings.leave; //Disables leave message
                }
                //Saves to guild passing the passing the new usagechannel if applicable and the new server settings 
                saveGuild(guild, {
                    channel_id: usageChannel,
                    settings: JSON.stringify(serverSettings)
                }).then(() => resolve(`Sucessfully toggled \`${settingChange}\` to \`${toggled}\``))
            }
        });
    });
}
exports.toggleSetting = toggleSetting;

//Check to see if the setting exists and if so return it
exports.checkSetting = (guild, check) => {
    return new Promise((resolve, reject) => {
        pool.query('SELECT * FROM server_settings WHERE guild_id = ' + guild.id, (err, result) => {
            if (err) reject(err); //If error reject with the error
            else if (result.length !== 0) { //If the server is in the database 
                if (result[0].settings && Object.keys(JSON.parse(result[0].settings)).length > 0) { //Checks if theres settings in the database
                    let settings = JSON.parse(result[0].settings); //sets setting as the parsed settings from the database
                    if (settings.hasOwnProperty('tableflip') && check === "tableflip") resolve(); //Resolve if tableflipping is turned on
                    else if (settings.hasOwnProperty('welcome') && check === "welcome") { //Check if a welcome is set and if thats the check being performed
                        resolve({
                            channel: result[0].channel_id,
                            response: settings.welcome
                        }); //Resolve with the welcome message and channel ID
                    } else if (settings.hasOwnProperty('leave') && check === "leave") { //Check if a leave is set and if thats the checking being performed
                        resolve({
                            channel: result[0].channel_id,
                            response: settings.leave
                        }); //Resolve with the leave message and channel ID
                    }
                }
            }
        });
    });
}

//Guild Prefix Functions

//Add guild to guildPrefixes object
function addGuildtoJson(guild) {
    return new Promise(resolve => {
        guildPrefixes[guild.id] = {};
        resolve();
    });
}

//Remove guild from guildPrefixes object if it exists in it
function removeGuildfromJson(guild) {
    if (guildPrefixes.hasOwnProperty(guild.id)) delete guildPrefixes[guild.id];
}
exports.removeGuildfromJson = removeGuildfromJson;

//Used for changing the guilds prefix
function changePrefix(guild, newPrefix) {
    return new Promise((resolve, reject) => {
        if (newPrefix === '') reject('The prefix cannot be nothing'); //Reject if prefix is nothing
        else if (newPrefix.includes(' ') || newPrefix === " ") reject('Prefixes cannot contain spaces'); //Reject if prefix contains spaces or is just a space
        else if (guildPrefixes.hasOwnProperty(guild.id)) { //If guild exists in guildPrefixes object already
            if (newPrefix === options.prefix) {
                removeGuildfromJson(guild); //If newPrefix is the same as the default prefix remove guild from json and resolve
                resolve();
            } else {
                guildPrefixes[guild.id] = newPrefix; //Change prefix to new prefix and resolve
                resolve();
            }
        } else addGuildtoJson(guild).then(() => changePrefix(guild, newPrefix).then(() => resolve())).catch(err => reject(err)); //Add guild to json then change prefix
        savePrefixes(); //Save guildPrefixes json file
    });
}
exports.changePrefix = changePrefix;

//Return the guild's prefix if it exists in the guildPrefixes database
exports.getPrefix = guild => {
    if (guildPrefixes.hasOwnProperty(guild.id)) return guildPrefixes[guild.id];
}

//Save guildPrefixes file checking to make sure that a blank file isn't saved
function savePrefixes() {
    fs.writeFile(__dirname + '/../database/guildPrefixes-temp.json', JSON.stringify(guildPrefixes, null, 4), error => {
        if (error) console.log(error);
        else {
            fs.stat(__dirname + '/../database/guildPrefixes-temp.json', (err, stats) => {
                if (err) console.log(err);
                else if (stats["size"] < 5) console.log(errorC("There was a size mismatch error with guildPrefixes"));
                else {
                    fs.renameSync(__dirname + '/../database/guildPrefixes-temp.json', __dirname + '/../database/guildPrefixes.json')
                }
            });
        }
    })
}