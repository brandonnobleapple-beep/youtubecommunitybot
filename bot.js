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
    console.info(`Ready! Logged in as ${client.user.tag} (${client.user.id})`);

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
    const apiUrl = "https://api.scrapecreators.com/v1/youtube/channel/community-posts";

    if (!apiKey) {
        console.error("YT_API_KEY is missing. Add your YouTube community-posts API key to Render Environment Variables.");
        return;
    }

    // Use YT_CHANNEL_IDS for multiple channels. The existing YT_CHANNEL_ID is kept as a fallback.
    const channelIds = (process.env.YT_CHANNEL_IDS || process.env.YT_CHANNEL_ID || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

    if (channelIds.length === 0) {
        console.error("No YouTube channel IDs configured. Add YT_CHANNEL_IDS to Render Environment Variables.");
        return;
    }

    const channelNames = (process.env.YT_CHANNEL_NAMES || "")
        .split(",")
        .map((name) => name.trim());

    console.info(`Monitoring ${channelIds.length} YouTube channel(s).`);

    // Optional one-time startup test. Set TEST_MODE=true in Render to send a test message.
    // Turn it back off after the test so restarts do not create repeated test messages.
    if (process.env.TEST_MODE === "true") {
        const testEmbed = new EmbedBuilder()
            .setTitle("YouTube Community Bot — Test")
            .setDescription("✅ Test successful! The bot can send YouTube Community notifications to this Discord channel.")
            .addFields({ name: "Status", value: "Monitoring is active." });
        channel.send({ embeds: [testEmbed] })
            .then(() => console.info("Test notification sent successfully."))
            .catch((error) => console.error("Could not send test notification:", error));
    }

    callAllChannels();
    // Check every 5 minutes so new Community posts are detected sooner than the old 1-hour interval.
    setInterval(callAllChannels, 300000);

    async function callAllChannels() {
        for (const [index, channelId] of channelIds.entries()) {
            const channelName = channelNames[index] || `YouTube Channel ${index + 1}`;
            await callAPI(channelId, channelName);
        }
    }

    async function callAPI(channelId, channelName) {
        try {
            console.info(`[${channelName}] Checking for Community posts...`);
            const response = await axios.get(apiUrl, {
                headers: { "x-api-key": apiKey },
                params: { channelId }
            });

            const payload = response.data?.data || response.data;
            const communityPosts = payload?.items || payload?.posts || payload?.communityPosts || [];

            if (!Array.isArray(communityPosts) || communityPosts.length === 0) {
                console.info(`[${channelName}] No community posts were returned.`);
                return;
            }

            const normalizedPosts = communityPosts
                .map((item) => item?.post || item)
                .filter((post) => post && post.id);

            if (normalizedPosts.length === 0) {
                console.info(`[${channelName}] The API returned no usable community posts.`);
                return;
            }

            const newPostID = normalizedPosts[0].id;
            const lastPostIDs = readLastPostIDs();
            const lastPostID = lastPostIDs[channelId];

            console.info(`[${channelName}] Previous post: ${lastPostID || "none"}`);
            console.info(`[${channelName}] Latest post: ${newPostID}`);

            if (lastPostID === newPostID) {
                console.info(`[${channelName}] No new posts.`);
                return;
            }

            if (!lastPostID) {
                console.info(`[${channelName}] First run. Saving the latest post without sending old posts.`);
                lastPostIDs[channelId] = newPostID;
                writeLastPostIDs(lastPostIDs);
                return;
            }

            const previousIndex = normalizedPosts.findIndex((post) => post.id === lastPostID);

            if (previousIndex === -1) {
                console.info(`[${channelName}] Previous post was not found. Sending the latest post only.`);
                postContent([normalizedPosts[0]], newPostID, channelName, channelId);
                return;
            }

            const newPosts = normalizedPosts.slice(0, previousIndex);
            postContent(newPosts, newPostID, channelName, channelId);
        } catch (error) {
            const status = error.response?.status;
            const apiMessage = error.response?.data;
            console.error(`[${channelName}] YouTube API request failed:`, status || error.message);
            if (apiMessage) {
                console.error("API response:", JSON.stringify(apiMessage));
            }
        }
    }

    function postContent(newPosts, newPostID, channelName, channelId) {
        newPosts.forEach((post) => {
            const postText = post.content || post.text || post.contentText?.[0]?.text || "New YouTube Community post";
            const postLink = post.url || `https://www.youtube.com/post/${post.id}`;
            const images = post.images || post.imageUrls || [];
            const imageURL = Array.isArray(images) ? images[0] : null;

            if (imageURL) {
                const imgEmbed = new EmbedBuilder()
                    .setTitle(`New YT Image — ${channelName}`)
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
                    .setTitle(`New YT Poll — ${channelName}`)
                    .setDescription(`**Poll Title:** ${postText}\n**Choices:**\n${choiceArray || "(choices unavailable)"}\n**Total Votes:** ${totalVotes}\n**Poll Link:** ${postLink}`);
                channel.send({ embeds: [pollEmbed] }).catch(console.error);
                return;
            }

            const textEmbed = new EmbedBuilder()
                .setTitle(`New YT Post — ${channelName}`)
                .setDescription(`**Post Text:** ${postText}\n**Post Link:** ${postLink}`);
            channel.send({ embeds: [textEmbed] }).catch(console.error);
        });

        const lastPostIDs = readLastPostIDs();
        lastPostIDs[channelId] = newPostID;
        writeLastPostIDs(lastPostIDs);
    }

    function readLastPostIDs() {
        try {
            if (!fs.existsSync("./lastPostIDs.json")) {
                return {};
            }
            return JSON.parse(fs.readFileSync("./lastPostIDs.json", "utf8"));
        } catch (error) {
            console.error("Could not read lastPostIDs.json:", error);
            return {};
        }
    }

    function writeLastPostIDs(lastPostIDs) {
        fs.writeFile("./lastPostIDs.json", JSON.stringify(lastPostIDs, null, 2), (err) => {
            if (err) console.error("Could not save lastPostIDs.json:", err);
        });
    }
});

client.login(token).catch((error) => {
    console.error("Discord login failed:", error.message);
});
