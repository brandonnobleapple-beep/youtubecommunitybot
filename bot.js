require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const token = process.env.BOT_TOKEN;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const axios = require("axios");
const fs = require("fs");
const http = require("http");

const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("YouTube Community Bot is running!\n");
}).listen(PORT, "0.0.0.0", () => {
    console.info(`Health server listening on port ${PORT}`);
});

client.once("ready", () => {
    console.info("Ready!");
    const guild = client.guilds.cache.get(process.env.SERVER_ID);
    if (!guild) {
        console.error("Discord server not found. Check SERVER_ID and bot access to the server.");
        return;
    }

    const channel = guild.channels.cache.get(process.env.CHANNEL_ID);
    if (!channel) {
        console.error("Discord channel not found. Check CHANNEL_ID and bot access to the channel.");
        return;
    }

    const URL = `${process.env.YT_API_URL}${process.env.YT_CHANNEL_ID}`;
    callAPI();
    setInterval(callAPI, 3600000);

    function callAPI() {
        axios
            .get(URL)
            .then(function (response) {
                let data = response.data;
                const communityPosts = data.items[0].community;
                let newPostID = JSON.stringify(communityPosts[0].id);
                fs.readFile("./lastPostID.json", "utf8", (err, lastPostID) => {
                    if (err) {
                        console.error("File read failed:", err);
                        return;
                    }
                    lastPostID = JSON.parse(lastPostID);
                    newPostID = JSON.parse(newPostID);
                    console.info(`ID of previous post is: ${lastPostID}`);
                    console.info(`ID of latest post is: ${newPostID}`);

                    if (lastPostID === newPostID) {
                        console.info("No new posts");
                    } else {
                        communityPosts.forEach((post, index) => {
                            if (post.id === lastPostID) {
                                const newPosts = communityPosts.slice(0, index);
                                postContent(newPosts, newPostID);
                            }
                        });
                    }
                });
            })
            .catch(function (error) {
                console.log(error);
            });
    }

    function postContent(newPosts, newPostID) {
        newPosts.forEach((post) => {
            const postText = post.contentText[0].text;
            if (post.image && post.image.thumbnails[5]) {
                const imgURL = post.image.thumbnails[5].url;
                const imgEmbed = new EmbedBuilder()
                    .setTitle("New YT Image")
                    .setDescription(`**Description:** ${postText} \n**Post Link:** https://www.youtube.com/post/${post.id}`)
                    .setImage(imgURL);
                channel.send({ embeds: [imgEmbed] }).catch(console.error);
            } else if (post.poll) {
                let choiceArray = [];
                post.poll.choices.forEach((choice) => choiceArray.push(choice.text));
                choiceArray = choiceArray.join("\n");
                const pollEmbed = new EmbedBuilder()
                    .setTitle("New YT Poll")
                    .setDescription(`**Poll Title:** ${postText} \n**Choices:** \n${choiceArray}\n**Total Votes:** ${post.poll.totalVotes} \n**Poll Link:** https://www.youtube.com/post/${post.id}`);
                channel.send({ embeds: [pollEmbed] }).catch(console.error);
            } else {
                const textEmbed = new EmbedBuilder()
                    .setTitle("New YT Post")
                    .setDescription(`**Post Text:** ${postText} \n**Post Link:** https://www.youtube.com/post/${post.id}`);
                channel.send({ embeds: [textEmbed] }).catch(console.error);
            }
        });

        fs.writeFile("lastPostID.json", JSON.stringify(newPostID), function (err) {
            if (err) console.info(err);
            else console.info("ID written");
        });
    }
});

client.login(token);
