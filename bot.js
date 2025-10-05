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
const fs = require('fs');
const path = require('path');

// === CONFIG ===
const TOKEN = 'MTQyMzk3NzMyMjA4MzY0NzUxOQ.GdBoOl.y1oPnQ7mrMHoyT5d3mHiwLtSlG-mIsdFfEO3vE'; // ← REPLACE
const CLIENT_ID = '1423977322083647519'; // ← REPLACE
const GUILD_ID = '1312298090916610160'; // ← REPLACE
const ALERT_CHANNEL_ID = '1312299015445938177'; // ← REPLACE (#task-alerts channel ID)

// === DATA PERSISTENCE ===
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            console.log('📥 No data file found — initializing fresh data.');
            return { tasks: {}, workers: {}, registeredTwitterHandles: [], taskIdCounter: 1 };
        }
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(rawData);
        const tasks = new Collection(Object.entries(data.tasks || {}));
        const workers = new Collection(Object.entries(data.workers || {}));
        const registeredTwitterHandles = new Set(data.registeredTwitterHandles || []);
        return {
            tasks,
            workers,
            registeredTwitterHandles,
            taskIdCounter: data.taskIdCounter || 1
        };
    } catch (error) {
        console.error('❌ Error loading data:', error.message);
        return {
            tasks: new Collection(),
            workers: new Collection(),
            registeredTwitterHandles: new Set(),
            taskIdCounter: 1
        };
    }
}

function saveData() {
    try {
        const data = {
            tasks: Object.fromEntries(client.tasks),
            workers: Object.fromEntries(client.workers),
            registeredTwitterHandles: [...client.registeredTwitterHandles],
            taskIdCounter
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('💾 Data saved successfully.');
    } catch (error) {
        console.error('❌ Error saving data:', error.message);
    }
}

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

const savedData = loadData();
client.tasks = savedData.tasks;
client.workers = savedData.workers;
client.registeredTwitterHandles = savedData.registeredTwitterHandles;
let taskIdCounter = savedData.taskIdCounter;

// === SLASH COMMANDS ===
const commands = [
    new SlashCommandBuilder()
        .setName('task')
        .setDescription('🔒 ADMIN ONLY: Create a new Twitter engagement task')
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
        .setName('approve')
        .setDescription('🔐 ADMIN ONLY: Approve a submission')
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
        .setDescription('🔐 ADMIN ONLY: Reject a submission')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User who submitted')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('task_id')
                .setDescription('Task ID')
                .setRequired(true)),

    // NEW: Remove custom points from one user
    new SlashCommandBuilder()
        .setName('removepoints')
        .setDescription('⚖️ ADMIN ONLY: Remove X points from a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove points from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of points to remove (positive number)')
                .setRequired(true)),

    // UPDATED: Clear ALL points (with confirm)
    new SlashCommandBuilder()
        .setName('clearpoints')
        .setDescription('🚨 ADMIN ONLY: Clear ALL points (type CONFIRM)')
        .addStringOption(option =>
            option.setName('confirm')
                .setDescription('Type "CONFIRM" to proceed')
                .setRequired(true)),

    // Let user reset their own points
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

// === READY EVENT ===
setTimeout(() => {
    console.log(`✅ ${client.user?.tag || 'Bot'} is online and ready!`);
}, 5000);

// === LOG TO ALERT CHANNEL (OPTIONAL HELPER) ===
async function logAction(message) {
    try {
        const alertChannel = await client.channels.fetch(ALERT_CHANNEL_ID).catch(() => null);
        if (alertChannel) {
            await alertChannel.send(message);
        }
    } catch (e) {
        console.warn('Could not log to alert channel:', e.message);
    }
}

// === MAIN INTERACTION HANDLER ===
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    const { commandName, user, member, customId } = interaction;

    if (!client.workers.has(user.id)) {
        client.workers.set(user.id, { twitter: null, points: 0, activeClaims: [] });
    }
    const worker = client.workers.get(user.id);
    const isAdmin = member?.permissions?.has('Administrator');

    // === HANDLE /task ===
    if (commandName === 'task') {
        if (!isAdmin) return interaction.reply({ content: "⛔ Only admins can create tasks!", flags: 64 });

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
        saveData();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(BUTTON_LIKE).setLabel('✅ Claim Like Task').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(BUTTON_RETWEET).setLabel('🔁 Claim Retweet Task').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(BUTTON_COMMENT).setLabel('💬 Claim Comment Task').setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🚀 NEW TASK ALERT!`)
            .setDescription(`**Task ID:** \`${taskId}\`\n**Post:** ${postLink}`)
            .addFields(
                { name: '🎯 Likes Needed', value: `${likes}`, inline: true },
                { name: '🔁 Retweets Needed', value: `${retweets}`, inline: true },
                { name: '💬 Comments Needed', value: `${comments}`, inline: true }
            )
            .setFooter({ text: 'Click a button below to claim!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], components: [row] });
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
        saveData();

        const claim = { taskId: task.id, taskType, claimedAt: Date.now(), status: 'pending_submission', proof: null };
        worker.activeClaims.push(claim);
        saveData();

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
                saveData();

                await logAction(`⚠️ <@${user.id}> timed out on ${taskType} task (ID: ${task.id}) — slot freed!`);

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
        saveData();

        await interaction.reply({
            content: "✅ Proof received! Awaiting admin approval. You’ll be notified soon.",
            flags: 64
        });
    }

    // === HANDLE /approve ===
    else if (commandName === 'approve') {
        if (!isAdmin) return interaction.reply({ content: "⛔ Admin only.", flags: 64 });

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
        saveData();

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
            saveData();
        }

        try {
            await targetUser.send(`🎉 Your ${claim.taskType} task (ID: ${taskId}) was approved! +${points} pts → Total: ${targetWorker.points}`);
        } catch (e) { /* ignore */ }

        await interaction.reply({ content: `✅ Approved ${targetUser}'s ${claim.taskType}. +${points} pts awarded.`, flags: 64 });
    }

    // === HANDLE /reject ===
    else if (commandName === 'reject') {
        if (!isAdmin) return interaction.reply({ content: "⛔ Admin only.", flags: 64 });

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
        saveData();

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
        saveData();
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

    // === HANDLE /removepoints (ADMIN ONLY) ===
    else if (commandName === 'removepoints') {
        if (!isAdmin) return interaction.reply({ content: "⛔ Admin access only.", flags: 64 });

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
        targetWorker.points = Math.max(0, targetWorker.points - amount); // Never go below 0
        const removed = oldPoints - targetWorker.points;

        saveData();

        // Log action
        await logAction(`⚖️ <@${user.id}> removed **${removed}** points from <@${targetUser.id}> (New total: ${targetWorker.points})`);

        await interaction.reply({
            content: `✅ Removed **${removed}** points from <@${targetUser.id}>.\nNew total: **${targetWorker.points}**`,
            flags: 64
        });

        // Notify user
        try {
            await targetUser.send(`⚖️ An admin removed **${removed}** points from your balance.\nNew total: **${targetWorker.points}**`);
        } catch (e) { /* ignore */ }
    }

    // === HANDLE /clearpoints (ADMIN ONLY) ===
    else if (commandName === 'clearpoints') {
        if (!isAdmin) return interaction.reply({ content: "⛔ Admin access only.", flags: 64 });

        const confirm = interaction.options.getString('confirm');
        if (confirm !== "CONFIRM") {
            return interaction.reply({ content: "❌ You must type `CONFIRM` exactly to proceed.", flags: 64 });
        }

        let clearedCount = 0;
        for (let [userId, worker] of client.workers) {
            worker.points = 0;
            clearedCount++;
        }
        saveData();

        await logAction(`🚨 **ALL POINTS CLEARED** by <@${user.id}> at ${new Date().toLocaleString()}`);

        await interaction.reply({
            content: `✅ **EMERGENCY RESET** — Cleared points for ${clearedCount} workers.`,
            flags: 64
        });
    }

    // === HANDLE /resetmypoints ===
    else if (commandName === 'resetmypoints') {
        const oldPoints = worker.points;
        worker.points = 0;
        saveData();

        await interaction.reply({
            content: `🧹 Your points have been reset from **${oldPoints}** to **0**.`,
            flags: 64
        });
    }
});

client.login(TOKEN);