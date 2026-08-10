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

    const apiKey = process.env.YT_API_KEY;
    const channelId = process.env.YT_CHANNEL_ID;
    const apiUrl = process.env.YT_API_URL || "https://api.scrapecreators.com/v1/youtube/channel/community-posts";

    if (!apiKey) {
        console.error("YT_API_KEY is missing. Add your YouTube community-posts API key to Render Environment Variables.");
        return;
    }

    if (!channelId) {
        console.error("YT_CHANNEL_ID is missing.");
        return;
    }

    callAPI();
    setInterval(callAPI, 3600000);

    async function callAPI() {
        try {
            const response = await axios.get(apiUrl, {
                headers: { "x-api-key": apiKey },
                params: { channelId }
            });

            const payload = response.data?.data || response.data;
            const communityPosts = payload?.items || payload?.posts || payload?.communityPosts || [];

            if (!Array.isArray(communityPosts) || communityPosts.length === 0) {
                console.info("No community posts were returned.");
                return;
            }

            const normalizedPosts = communityPosts
                .map((item) => item?.post || item)
                .filter((post) => post && post.id);

            if (normalizedPosts.length === 0) {
                console.info("The API returned no usable community posts.");
                return;
            }

            const newPostID = normalizedPosts[0].id;

            fs.readFile("./lastPostID.json", "utf8", (err, lastPostIDText) => {
                if (err) {
                    console.error("File read failed:", err);
                    return;
                }

                let lastPostID;
                try {
                    lastPostID = JSON.parse(lastPostIDText);
                } catch (parseError) {
                    console.error("Could not parse lastPostID.json:", parseError);
                    return;
                }

                console.info(`ID of previous post is: ${lastPostID}`);
                console.info(`ID of latest post is: ${newPostID}`);

                if (lastPostID === newPostID) {
                    console.info("No new posts");
                    return;
                }

                const previousIndex = normalizedPosts.findIndex((post) => post.id === lastPostID);

                if (previousIndex === -1) {
                    console.info("Previous post was not found in the returned page. Sending the latest post only to avoid a flood.");
                    postContent([normalizedPosts[0]], newPostID);
                    return;
                }

                const newPosts = normalizedPosts.slice(0, previousIndex);
                postContent(newPosts, newPostID);
            });
        } catch (error) {
            const status = error.response?.status;
            const apiMessage = error.response?.data;
            console.error("YouTube community-posts API request failed:", status || error.message);
            if (apiMessage) {
                console.error("API response:", JSON.stringify(apiMessage));
            }
        }
    }

    function postContent(newPosts, newPostID) {
        newPosts.forEach((post) => {
            const postText = post.content || post.text || post.contentText?.[0]?.text || "New YouTube Community post";
            const postLink = post.url || `https://www.youtube.com/post/${post.id}`;
            const images = post.images || post.imageUrls || [];
            const imageURL = Array.isArray(images) ? images[0] : null;

            if (imageURL) {
                const imgEmbed = new EmbedBuilder()
                    .setTitle("New YT Image")
                    .setDescription(`**Description:** ${postText}\n**Post Link:** ${postLink}`)
                    .setImage(imageURL);
                channel.send({ embeds: [imgEmbed] }).catch(console.error);
                return;
            }

            if (post.poll) {
                const choices = post.poll.choices || post.poll.options || [];
                const choiceArray = choices
                    .map((choice) => typeof choice === "string" ? choice : choice.text || choice.title || "")
                    .filter(Boolean)
                    .join("\n");
                const totalVotes = post.poll.totalVotes ?? post.poll.voteCount ?? "Unknown";
                const pollEmbed = new EmbedBuilder()
                    .setTitle("New YT Poll")
                    .setDescription(`**Poll Title:** ${postText}\n**Choices:**\n${choiceArray || "(choices unavailable)"}\n**Total Votes:** ${totalVotes}\n**Poll Link:** ${postLink}`);
                channel.send({ embeds: [pollEmbed] }).catch(console.error);
                return;
            }

            const textEmbed = new EmbedBuilder()
                .setTitle("New YT Post")
                .setDescription(`**Post Text:** ${postText}\n**Post Link:** ${postLink}`);
            channel.send({ embeds: [textEmbed] }).catch(console.error);
        });

        fs.writeFile("lastPostID.json", JSON.stringify(newPostID), function (err) {
            if (err) console.info(err);
            else console.info("ID written");
        });
    }
});

client.login(token).catch((error) => {
    console.error("Discord login failed:", error.message);
});
