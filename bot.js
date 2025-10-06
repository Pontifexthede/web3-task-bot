// === IMPORTS ===
const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    SlashCommandBuilder,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const Database = require('@replit/database');

// === CONFIG (SET THESE IN REPLIT SECRETS) ===
const TOKEN = process.env.MTQyMzk3NzMyMjA4MzY0NzUxOQ.GYWaHA.UlO7x5_ksJieSSO0QjVcfLmwY-0kWVUToTHNzA;
const CLIENT_ID = process.env.1423977322083647519;
const GUILD_ID = process.env.1312298090916610160;

// === CHANNEL IDS (SET IN REPLIT SECRETS OR REPLACE HERE) ===
const TASK_ANNOUNCE_CHANNEL_ID = process.env.TASK_ANNOUNCE_CHANNEL_ID || '1312298517456486420';
const TASK_SUBMISSION_CHANNEL_ID = process.env.TASK_SUBMISSION_CHANNEL_ID || '1424472184931487764';
const APPROVAL_REWARDS_CHANNEL_ID = process.env.APPROVAL_REWARDS_CHANNEL_ID || '1424514444968329296';
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID || '1424549743387738122';

// === STORAGE ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

const db = new Database();
client.tasks = new Collection();
client.workers = new Collection();
client.registeredTwitterHandles = new Set();
let taskIdCounter = 1;

// === LOAD DATA FROM REPLIT DB ===
async function loadData() {
    try {
        const rawData = await db.get('botData');
        if (!rawData) {
            console.log('📥 No saved data — initializing fresh.');
            return { tasks: {}, workers: {}, registeredTwitterHandles: [], taskIdCounter: 1 };
        }

        const data = JSON.parse(rawData);
        const tasks = new Collection();
        for (const [id, task] of Object.entries(data.tasks || {})) {
            tasks.set(id, task);
        }

        const workers = new Collection();
        for (const [id, worker] of Object.entries(data.workers || {})) {
            workers.set(id, worker);
        }

        const registeredTwitterHandles = new Set(data.registeredTwitterHandles || []);

        console.log(`✅ Loaded: ${tasks.size} tasks, ${workers.size} workers`);
        return { tasks, workers, registeredTwitterHandles, taskIdCounter: data.taskIdCounter || 1 };
    } catch (error) {
        console.error('❌ Error loading from Replit DB:', error.message);
        return { tasks: new Collection(), workers: new Collection(), registeredTwitterHandles: new Set(), taskIdCounter: 1 };
    }
}

// === SAVE DATA TO REPLIT DB ===
async function saveData() {
    try {
        const data = {
            tasks: Object.fromEntries(client.tasks),
            workers: Object.fromEntries(client.workers),
            registeredTwitterHandles: [...client.registeredTwitterHandles],
            taskIdCounter
        };

        await db.set('botData', JSON.stringify(data));
        console.log('💾 Saved to Replit DB successfully.');
    } catch (error) {
        console.error('❌ Error saving to Replit DB:', error.message);
    }
}

// === SLASH COMMANDS ===
const commands = [
    // === ADMIN COMMANDS ===
    new SlashCommandBuilder()
        .setName('task')
        .setDescription('🔒 Create a new Twitter engagement task')
        .addStringOption(option =>
            option.setName('post_link')
                .setDescription('Link to the tweet')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('likes')
                .setDescription('Number of likes needed')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('retweets')
                .setDescription('Number of retweets needed')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('comments')
                .setDescription('Number of comments needed')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('approve')
        .setDescription('🔐 Approve a submission')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User who submitted')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('task_id')
                .setDescription('Task ID')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('reject')
        .setDescription('🔐 Reject a submission')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User who submitted')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('task_id')
                .setDescription('Task ID')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('removepoints')
        .setDescription('⚖️ Remove X points from a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove points from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of points to remove')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('clearpoints')
        .setDescription('🚨 Clear ALL points (type CONFIRM)')
        .addStringOption(option =>
            option.setName('confirm')
                .setDescription('Type "CONFIRM" to proceed')
                .setRequired(true)),

    // === USER COMMANDS ===
    new SlashCommandBuilder()
        .setName('register')
        .setDescription('🔗 Register your unique Twitter/X handle')
        .addStringOption(option =>
            option.setName('twitter_handle')
                .setDescription('Your Twitter @username')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('mypoints')
        .setDescription('📊 Check your total points'),

    new SlashCommandBuilder()
        .setName('taskstatus')
        .setDescription('📋 Check current task availability'),

    new SlashCommandBuilder()
        .setName('resetmypoints')
        .setDescription('🧹 Reset ONLY your own points to zero')
];

// === REGISTER COMMANDS ===
(async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔃 Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('✅ Guild commands registered successfully!');
    } catch (error) {
        console.log('❌ Error registering commands:', error);
    }
})();

// === BUTTON IDS ===
const BUTTON_LIKE = 'claim_like';
const BUTTON_RETWEET = 'claim_retweet';
const BUTTON_COMMENT = 'claim_comment';

// === LOAD DATA ON STARTUP ===
(async () => {
    const savedData = await loadData();
    client.tasks = savedData.tasks;
    client.workers = savedData.workers;
    client.registeredTwitterHandles = savedData.registeredTwitterHandles;
    taskIdCounter = savedData.taskIdCounter;
})();

// === READY EVENT ===
setTimeout(() => {
    console.log(`✅ ${client.user?.tag || 'Bot'} is online and ready!`);
}, 5000);

// === LOG TO CHANNEL HELPER ===
async function logToChannel(channelId, message, embed = null) {
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
            if (embed) {
                await channel.send({ embeds: [embed] });
            } else {
                await channel.send(message);
            }
        }
    } catch (e) {
        console.warn(`Could not log to channel ${channelId}:`, e.message);
    }
}

// === MAIN INTERACTION HANDLER ===
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    const { commandName, user, member } = interaction;

    // Initialize worker if new
    if (!client.workers.has(user.id)) {
        client.workers.set(user.id, { twitter: null, points: 0, activeClaims: [] });
    }
    const worker = client.workers.get(user.id);

    // Check if user has admin permissions
    const isAdmin = member?.permissions?.has('Administrator');

    // === ROLE-BASED COMMAND ACCESS ===
    const adminOnlyCommands = ['task', 'approve', 'reject', 'removepoints', 'clearpoints'];
    if (adminOnlyCommands.includes(commandName) && !isAdmin) {
        return interaction.reply({ content: "⛔ Only admins can use this command.", flags: 64 });
    }

    // === HANDLE /task (ADMIN ONLY) ===
    if (commandName === 'task') {
        const postLink = interaction.options.getString('post_link');
        const likes = interaction.options.getInteger('likes');
        const retweets = interaction.options.getInteger('retweets');
        const comments = interaction.options.getInteger('comments');

        const taskId = taskIdCounter++;
        const task = {
            id: taskId,
            postLink,
            maxLikes: likes,
            maxRetweets: retweets,
            maxComments: comments,
            claimedLikes: 0,
            claimedRetweets: 0,
            claimedComments: 0,
            completions: []
        };

        client.tasks.set(taskId, task);
        await saveData();

        // Announce to task channel with @everyone
        const announceEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`🚨 NEW TASK DROPPED!`)
            .setDescription(`**Post:** ${postLink}`)
            .addFields(
                { name: '🎯 LIKE Tasks', value: `${likes} slots — 1 point each`, inline: true },
                { name: '🔁 RETWEET Tasks', value: `${retweets} slots — 2 points each`, inline: true },
                { name: '💬 COMMENT Tasks', value: `${comments} slots — 3 points each`, inline: true }
            )
            .setFooter({ text: 'Claim tasks fast — first come, first served!' })
            .setTimestamp();

        await logToChannel(TASK_ANNOUNCE_CHANNEL_ID, '@everyone', announceEmbed);

        await interaction.reply({ content: "✅ Task created and announced!", flags: 64 });
    }

    // === HANDLE TASK CLAIM BUTTONS ===
    else if (interaction.isButton() && [BUTTON_LIKE, BUTTON_RETWEET, BUTTON_COMMENT].includes(customId)) {
        const task = [...client.tasks.values()].slice(-1)[0];
        if (!task) return interaction.reply({ content: "📭 No active task.", flags: 64 });
        if (!worker.twitter) return interaction.reply({ content: "🐦 Register Twitter first: `/register`", flags: 64 });

        let taskType, taskKey;
        if (customId === BUTTON_LIKE) {
            if (task.claimedLikes >= task.maxLikes) return interaction.reply({ content: "🚫 Likes full!", flags: 64 });
            taskType = 'LIKE'; taskKey = 'claimedLikes';
        } else if (customId === BUTTON_RETWEET) {
            if (task.claimedRetweets >= task.maxRetweets) return interaction.reply({ content: "🚫 Retweets full!", flags: 64 });
            taskType = 'RETWEET'; taskKey = 'claimedRetweets';
        } else if (customId === BUTTON_COMMENT) {
            if (task.claimedComments >= task.maxComments) return interaction.reply({ content: "🚫 Comments full!", flags: 64 });
            taskType = 'COMMENT'; taskKey = 'claimedComments';
        }

        task[taskKey]++;
        await saveData();

        const claim = { taskId: task.id, taskType, claimedAt: Date.now(), status: 'pending_submission', proof: null };
        worker.activeClaims.push(claim);
        await saveData();

        await interaction.reply({ content: `📸 After completing your ${taskType} on Twitter, submit a screenshot below!`, flags: 64 });

        const modal = {
            title: `📤 Submit ${taskType} Proof`,
            custom_id: `${taskType.toLowerCase()}_modal_${user.id}_${task.id}`,
            components: [{
                type: 1,
                components: [{
                    type: 4,
                    custom_id: 'proof_image',
                    label: 'Image URL of your engagement',
                    style: 1,
                    placeholder: 'https://i.imgur.com/abc.png',
                    required: true
                }]
            }]
        };

        await interaction.showModal(modal);

        // Set 10-min timeout
        setTimeout(async () => {
            const activeClaim = worker.activeClaims.find(c => c.taskId === task.id && c.taskType === taskType && c.status === 'pending_submission');
            if (activeClaim) {
                activeClaim.status = 'timed_out';
                task[taskKey]--;
                await saveData();

                await logToChannel(ALERT_CHANNEL_ID, `⚠️ <@${user.id}> timed out on ${taskType} task (ID: ${task.id}) — slot freed!`);

                try {
                    await user.send(`⏰ You didn’t submit proof for your ${taskType} task in time. Slot has been released.`);
                } catch (e) { /* ignore */ }
            }
        }, 10 * 60 * 1000);
    }

    // === HANDLE MODAL SUBMISSION ===
    else if (interaction.isModalSubmit() && interaction.customId.includes('_modal_')) {
        const parts = interaction.customId.split('_');
        const taskType = parts[0].toUpperCase();
        const userId = parts[1];
        const taskIdStr = parts[2];
        const taskId = parseInt(taskIdStr);

        const task = client.tasks.get(taskId);
        if (!task) return interaction.reply({ content: "❌ Task not found.", flags: 64 });

        const claim = worker.activeClaims.find(c => c.taskId === taskId && c.taskType === taskType && c.status === 'pending_submission');
        if (!claim) return interaction.reply({ content: "❌ No active claim.", flags: 64 });

        claim.proof = interaction.fields.getTextInputValue('proof_image');
        claim.status = 'awaiting_approval';
        await saveData();

        // Log to submission channel
        const remaining = task[`max${taskType}s`] - task[`claimed${taskType}s`];
        await logToChannel(TASK_SUBMISSION_CHANNEL_ID, `✅ New ${taskType} submission received! ${remaining} ${taskType} slots remaining.`);

        await interaction.reply({
            content: "✅ Proof received! Awaiting admin approval. You’ll be notified soon.",
            flags: 64
        });
    }

    // === HANDLE /approve (ADMIN ONLY) ===
    else if (commandName === 'approve') {
        const targetUser = interaction.options.getUser('user');
        const taskId = interaction.options.getInteger('task_id');
        const targetWorker = client.workers.get(targetUser.id);
        if (!targetWorker) return interaction.reply({ content: "❌ User not found.", flags: 64 });

        const claimIndex = targetWorker.activeClaims.findIndex(c =>
            c.taskId === taskId && c.status === 'awaiting_approval'
        );
        if (claimIndex === -1) return interaction.reply({ content: "❌ No submission found.", flags: 64 });

        const claim = targetWorker.activeClaims[claimIndex];
        claim.status = 'completed';

        let points = 0;
        if (claim.taskType === 'LIKE') points = 1;
        else if (claim.taskType === 'RETWEET') points = 2;
        else if (claim.taskType === 'COMMENT') points = 3;

        targetWorker.points += points;
        await saveData();

        const task = client.tasks.get(taskId);
        if (task) {
            task.completions.push({
                userId: targetUser.id,
                username: targetUser.username,
                twitter: targetWorker.twitter,
                action: claim.taskType,
                proof: claim.proof,
                points
            });
            await saveData();
        }

        // Announce in rewards channel
        await logToChannel(APPROVAL_REWARDS_CHANNEL_ID, `🎉 <@${targetUser.id}> earned **${points} point(s)** for **${claim.taskType}** task!`);

        try {
            await targetUser.send(`🎉 Your ${claim.taskType} task (ID: ${taskId}) was approved! +${points} pts → Total: ${targetWorker.points}`);
        } catch (e) { /* ignore */ }

        await interaction.reply({ content: `✅ Approved ${targetUser}'s ${claim.taskType}. +${points} pts awarded.`, flags: 64 });
    }

    // === HANDLE /reject (ADMIN ONLY) ===
    else if (commandName === 'reject') {
        const targetUser = interaction.options.getUser('user');
        const taskId = interaction.options.getInteger('task_id');
        const targetWorker = client.workers.get(targetUser.id);
        if (!targetWorker) return interaction.reply({ content: "❌ User not found.", flags: 64 });

        const claimIndex = targetWorker.activeClaims.findIndex(c =>
            c.taskId === taskId && c.status === 'awaiting_approval'
        );
        if (claimIndex === -1) return interaction.reply({ content: "❌ No submission found.", flags: 64 });

        const claim = targetWorker.activeClaims[claimIndex];
        claim.status = 'rejected';
        await saveData();

        try {
            await targetUser.send(`❌ Your ${claim.taskType} task (ID: ${taskId}) was rejected by admin. No points awarded.`);
        } catch (e) { /* ignore */ }

        await interaction.reply({ content: `❌ Rejected ${targetUser}'s ${claim.taskType}. No points awarded.`, flags: 64 });
    }

    // === HANDLE /register ===
    else if (commandName === 'register') {
        let twitterHandle = interaction.options.getString('twitter_handle').replace(/^@/, '');
        if (client.registeredTwitterHandles.has(twitterHandle)) {
            return interaction.reply({ content: `❌ @${twitterHandle} already taken.`, flags: 64 });
        }
        if (worker.twitter) {
            client.registeredTwitterHandles.delete(worker.twitter.replace('@', ''));
        }
        worker.twitter = `@${twitterHandle}`;
        client.registeredTwitterHandles.add(twitterHandle);
        await saveData();
        await interaction.reply({ content: `✅ Registered: ${worker.twitter}`, flags: 64 });
    }

    // === HANDLE /mypoints ===
    else if (commandName === 'mypoints') {
        const embed = new EmbedBuilder()
            .setColor(0x00BFFF)
            .setTitle(`📊 Stats for ${user.username}`)
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                { name: '🐦 Twitter', value: worker.twitter || '❌ Not set', inline: false },
                { name: '⭐ Total Points', value: `**${worker.points}**`, inline: true },
                {
                    name: '⏳ Pending Submissions',
                    value: `**${worker.activeClaims.filter(c => c.status === 'awaiting_approval').length}**`,
                    inline: true
                }
            )
            .setFooter({ text: 'Complete tasks → submit proof → get approved → earn points!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: 64 });
    }

    // === HANDLE /taskstatus ===
    else if (commandName === 'taskstatus') {
        const task = [...client.tasks.values()].slice(-1)[0];
        if (!task) {
            return interaction.reply({ content: "📭 No active task.", flags: 64 });
        }

        const statusEmbed = new EmbedBuilder()
            .setColor(0x1E90FF)
            .setTitle(`📊 CURRENT TASK STATUS`)
            .setDescription(`**Post:** ${task.postLink}`)
            .addFields(
                {
                    name: '👍 LIKES',
                    value: `${task.maxLikes - task.claimedLikes} / ${task.maxLikes} slots left`,
                    inline: true
                },
                {
                    name: '🔁 RETWEETS',
                    value: `${task.maxRetweets - task.claimedRetweets} / ${task.maxRetweets} slots left`,
                    inline: true
                },
                {
                    name: '💬 COMMENTS',
                    value: `${task.maxComments - task.claimedComments} / ${task.maxComments} slots left`,
                    inline: true
                }
            )
            .setFooter({ text: 'Submit proof after claiming!' })
            .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed], flags: 64 });
    }

    // === HANDLE /resetmypoints ===
    else if (commandName === 'resetmypoints') {
        const oldPoints = worker.points;
        worker.points = 0;
        await saveData();
        await interaction.reply({
            content: `🧹 Your points have been reset from **${oldPoints}** to **0**.`,
            flags: 64
        });
    }

    // === HANDLE /removepoints (ADMIN ONLY) ===
    else if (commandName === 'removepoints') {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
            return interaction.reply({ content: "❌ Please enter a positive number.", flags: 64 });
        }

        const targetWorker = client.workers.get(targetUser.id);
        if (!targetWorker) {
            return interaction.reply({ content: "❌ User not found in system.", flags: 64 });
        }

        const oldPoints = targetWorker.points;
        targetWorker.points = Math.max(0, targetWorker.points - amount);
        const removed = oldPoints - targetWorker.points;

        await saveData();
        await logToChannel(ALERT_CHANNEL_ID, `⚖️ <@${user.id}> removed **${removed}** points from <@${targetUser.id}> (New total: ${targetWorker.points})`);

        try {
            await targetUser.send(`⚖️ An admin removed **${removed}** points from your balance.\nNew total: **${targetWorker.points}**`);
        } catch (e) { /* ignore */ }

        await interaction.reply({
            content: `✅ Removed **${removed}** points from <@${targetUser.id}>.\nNew total: **${targetWorker.points}**`,
            flags: 64
        });
    }

    // === HANDLE /clearpoints (ADMIN ONLY) ===
    else if (commandName === 'clearpoints') {
        const confirm = interaction.options.getString('confirm');
        if (confirm !== "CONFIRM") {
            return interaction.reply({ content: "❌ You must type `CONFIRM` exactly to proceed.", flags: 64 });
        }

        let clearedCount = 0;
        for (let [userId, worker] of client.workers) {
            worker.points = 0;
            clearedCount++;
        }
        await saveData();
        await logToChannel(ALERT_CHANNEL_ID, `🚨 **ALL POINTS CLEARED** by <@${user.id}> at ${new Date().toLocaleString()}`);

        await interaction.reply({
            content: `✅ **EMERGENCY RESET** — Cleared points for ${clearedCount} workers.`,
            flags: 64
        });
    }
});

client.login(TOKEN);
