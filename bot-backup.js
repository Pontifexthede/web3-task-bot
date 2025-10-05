// === STEP 1: Import Discord.js ===
const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    SlashCommandBuilder,
    Routes
} = require('discord.js');
const { REST } = require('@discordjs/rest');

// === STEP 2: Setup Bot Client ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// === STEP 3: Your Bot Token ===
const TOKEN = 'MTQyMzk3NzMyMjA4MzY0NzUxOQ.GdBoOl.y1oPnQ7mrMHoyT5d3mHiwLtSlG-mIsdFfEO3vE'; // ← REPLACE THIS WITH YOUR TOKEN
const CLIENT_ID = '1423977322083647519'; // ← We'll get this next

// === STEP 4: Storage for Tasks & Workers ===
client.tasks = new Collection(); // Stores active tasks
client.workers = new Collection(); // Stores worker points
let taskIdCounter = 1;

// === STEP 5: Define Slash Commands ===
const commands = [
    new SlashCommandBuilder()
        .setName('task')
        .setDescription('Create a new Twitter engagement task')
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
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('budget')
                .setDescription('Total budget in USD (e.g., 5)')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('like')
        .setDescription('Claim a LIKE task'),

    new SlashCommandBuilder()
        .setName('retweet')
        .setDescription('Claim a RETWEET task'),

    new SlashCommandBuilder()
        .setName('comment')
        .setDescription('Claim a COMMENT task'),

    new SlashCommandBuilder()
        .setName('submit')
        .setDescription('Submit proof of completed task')
        .addIntegerOption(option =>
            option.setName('task_id')
                .setDescription('ID of the task you claimed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('proof')
                .setDescription('Link to screenshot or tweet')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('mypoints')
        .setDescription('Check your total points')
];

// === STEP 6: Register Slash Commands ===
(async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔃 Registering slash commands...');
        const GUILD_ID = '1312298090916610160'; // ← We'll get this next

// Register globally (can take up to 1 hour)
await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
);

// ALSO register for your specific server (INSTANT)
await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
);
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.log('❌ Error registering commands:', error);
    }
})();

// === STEP 7: When Bot Is Ready ===
client.once('clientReady', async () => {
    setTimeout(() => {
        console.log(`✅ ${client.user.tag} is online and ready to manage tasks!`);
    }, 2000);
});

// === STEP 8: Handle Command Interactions ===
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, user } = interaction;

    // Initialize worker if first time
    if (!client.workers.has(user.id)) {
        client.workers.set(user.id, { username: user.username, points: 0 });
    }

    // === HANDLE /task COMMAND ===
    if (commandName === 'task') {
        const postLink = interaction.options.getString('post_link');
        const likes = interaction.options.getInteger('likes');
        const retweets = interaction.options.getInteger('retweets');
        const comments = interaction.options.getInteger('comments');
        const budget = interaction.options.getNumber('budget');

        const taskId = taskIdCounter++;
        const task = {
            id: taskId,
            postLink,
            maxLikes: likes,
            maxRetweets: retweets,
            maxComments: comments,
            budget,
            claimedLikes: 0,
            claimedRetweets: 0,
            claimedComments: 0,
            completed: []
        };

        client.tasks.set(taskId, task);

        await interaction.reply({
            content: `
📢 **NEW TASK CREATED!**
Task ID: \`${taskId}\`
Post: ${postLink}
💰 Budget: $${budget} → Workers get 70% = $${(budget * 0.7).toFixed(2)}
🎯 Available:
- Likes: ${likes}
- Retweets: ${retweets}
- Comments: ${comments}

Workers: Use \`/like\`, \`/retweet\`, or \`/comment\` to claim!
            `,
            ephemeral: false
        });
    }

    // === HANDLE /like ===
    else if (commandName === 'like') {
        const lastTask = [...client.tasks.values()].pop(); // Get latest task
        if (!lastTask || lastTask.claimedLikes >= lastTask.maxLikes) {
            return interaction.reply({ content: "❌ No LIKE slots available right now.", ephemeral: true });
        }

        lastTask.claimedLikes++;
        await interaction.reply({
            content: `✅ You claimed a LIKE task for Post: ${lastTask.postLink}\nSubmit proof with: \`/submit task_id:${lastTask.id} proof:your_link_here\``,
            ephemeral: true
        });
    }

    // === HANDLE /retweet ===
    else if (commandName === 'retweet') {
        const lastTask = [...client.tasks.values()].pop();
        if (!lastTask || lastTask.claimedRetweets >= lastTask.maxRetweets) {
            return interaction.reply({ content: "❌ No RETWEET slots available right now.", ephemeral: true });
        }

        lastTask.claimedRetweets++;
        await interaction.reply({
            content: `✅ You claimed a RETWEET task for Post: ${lastTask.postLink}\nSubmit proof with: \`/submit task_id:${lastTask.id} proof:your_link_here\``,
            ephemeral: true
        });
    }

    // === HANDLE /comment ===
    else if (commandName === 'comment') {
        const lastTask = [...client.tasks.values()].pop();
        if (!lastTask || lastTask.claimedComments >= lastTask.maxComments) {
            return interaction.reply({ content: "❌ No COMMENT slots available right now.", ephemeral: true });
        }

        lastTask.claimedComments++;
        await interaction.reply({
            content: `✅ You claimed a COMMENT task for Post: ${lastTask.postLink}\nSubmit proof with: \`/submit task_id:${lastTask.id} proof:your_link_here\``,
            ephemeral: true
        });
    }

    // === HANDLE /submit ===
    else if (commandName === 'submit') {
        const taskId = interaction.options.getInteger('task_id');
        const proof = interaction.options.getString('proof');
        const task = client.tasks.get(taskId);

        if (!task) {
            return interaction.reply({ content: "❌ Task not found.", ephemeral: true });
        }

        // For simplicity: approve all submissions (you can add mod approval later)
        let pointsEarned = 0;
        // In real use, track which task type user claimed — for now, we assume based on availability
        // Simple version: give 1 point for like, 2 for retweet, 3 for comment (you can expand later)

        // TEMP: Just give 2 points per submission for demo
        pointsEarned = 2;

        // Add points to worker
        const worker = client.workers.get(user.id);
        worker.points += pointsEarned;

        await interaction.reply({
            content: `✅ Proof submitted! You earned ${pointsEarned} points.\nTotal Points: ${worker.points}`,
            ephemeral: true
        });
    }

    // === HANDLE /mypoints ===
    else if (commandName === 'mypoints') {
        const worker = client.workers.get(user.id);
        await interaction.reply({
            content: `📊 **Your Total Points: ${worker.points}**`,
            ephemeral: true
        });
    }
});

// === STEP 9: Login ===
client.login(TOKEN);