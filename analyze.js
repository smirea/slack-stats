
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const {unique} = require('./utils');
const metadata = require('./archive/metadata.json');

const DIR = 'archive';

const DEFAUL_USERS = [
    'U0B3JPJ0G', // sam
    'U0B49717H', // jessiewright
    'U0B3WUEP6', // xuan
    'U35A7SYJW', // dashalom
    'U0B3HRP2A', // stefan
];

const SPACE_REG = /\s+/;
const TAG_REG = /<[^>]*>/g;
const GREETING_REG = /^(hello|hi|holla|howdy|sup|yo)[^a-z]*$/i;
const MIN_BLOCK_SIZE = 3;
const BLOCK_DELTA = 10 * 1000;

const init = () => {
    const data = readData();

    const allChannels = [].concat.apply([], [
        Object.values(data.private_channels),
        Object.values(data.direct_messages),
        Object.values(data.channels),
    ]);

    console.log(analyze(allChannels, {userWhitelist: DEFAUL_USERS}));
    // console.log(analyze([data.direct_messages.sam], {userWhitelist: DEFAUL_USERS}));
};

const analyze = (channelList, options) => {
    options = Object.assign({
        userWhitelist: Object.keys(metadata.users),
    }, options);

    const userMap = {};
    for (let id of options.userWhitelist) {
        userMap[id] = {
            name: metadata.users[id],
            messages: [],
            words: [],
            blocks: [],
        };
    }

    for (let channel of channelList) gatherData(userMap, channel);

    computeStats(userMap);

    return Object.values(userMap);
};

const computeStats = (userMap) => {
    const formatNum = num => Math.round(num * 100) / 100;
    const getMedian = arr => !arr.length ? null : arr[Math.round(arr.length / 2)];
    for (let user in userMap) {
        const obj = userMap[user];
        const {messages, words} = obj;

        obj.messageCount = messages.length;
        obj.averageMessageLength = 0;
        obj.greetingCount = 0;
        obj.firstGreetingCount = 0;
        for (let msg of messages) {
            obj.averageMessageLength += msg.text.length;
            if (msg.isGreeting) ++obj.greetingCount;
            if (msg.isFirstGreeting) ++obj.firstGreetingCount;
        }
        obj.averageMessageLength = formatNum(obj.averageMessageLength / obj.messageCount);
        obj.averageWordsPerMessage = formatNum(words.length / obj.messageCount);

        const sortedMessages = Array.from(messages).sort((a, b) => b.text.length - a.text.length);
        obj.medianWordsPerMessage = getMedian(sortedMessages) && getMedian(sortedMessages).words.length || 0;

        obj.blocks.sort((a, b) => b.length - a.length);
        obj.blockCount = obj.blocks.length;
        obj.averageBlockSize = formatNum(
            obj.blocks.reduce((sum, block) => sum + block.length, 0) / obj.blockCount
        );
        obj.medianBlockSize = getMedian(obj.blocks) && getMedian(obj.blocks).length || 0;

        delete obj.messages;
        delete obj.words;
        delete obj.blocks;
    }
    for (let user in userMap) {
        if (userMap[user].messageCount) continue;
        delete userMap[user];
    }
};

const gatherData = (userMap, {channel_info: {members}, messages}) => {
    if (!members.some(id => !!userMap[id])) return;

    for (let msg of messages) {
        const obj = userMap[msg.user];
        if (!obj) continue;
        obj.messages.push(msg);
        obj.words.push(...msg.words);
    }

    for (let index = 0; index < messages.length; ++index) {
        const msg = messages[index];
        if (!userMap[msg.user]) continue;
        const block = [msg];
        for (let nextIndex = index + 1; nextIndex < messages.length; ++nextIndex) {
            const nextMsg = messages[nextIndex];
            if (nextMsg.user !== msg.user) break;
            if (nextMsg.time - msg.time >= BLOCK_DELTA) break;
            block.push(nextMsg);
        }
        if (block.length < MIN_BLOCK_SIZE) continue;
        userMap[msg.user].blocks.push(block);
    }
};

const readData = () => {
    const result = {};
    let dayID = 0;
    let lastDayIndex = Infinity;

    for (let key of ['channels', 'direct_messages', 'private_channels']) {
        result[key] = {};
        const root = path.join(DIR, key);
        for (let file of fs.readdirSync(root)) {
            if (path.extname(file) !== '.json') continue;
            const data = JSON.parse('' + fs.readFileSync(path.join(root, file)));

            // by default the messages are sorted new -> old, reverse that
            data.messages.reverse();

            const finalMessages = [];
            let greetingToday = false;
            for (let obj of data.messages) {
                const [time, count] = obj.ts.split('.');
                obj.time = parseInt(time, 10) * 1000;
                obj.dayIndex = parseInt(count, 10) - 1;
                if (obj.dayIndex <= lastDayIndex) {
                    ++dayID;
                    greetingToday = false;
                }
                lastDayIndex = obj.dayIndex;
                obj.dayID = dayID;

                // Completely exclude text blocks
                if (!obj.text || obj.text.includes('```')) continue;

                // Remove tags (e.g. links, mentions) and things with no text
                obj.text = obj.text.replace(TAG_REG, '').trim();
                if (!obj.text) continue;

                obj.words = obj.text.split(SPACE_REG);
                obj.isGreeting = GREETING_REG.test(obj.text);
                if (obj.isGreeting) {
                    obj.isFirstGreeting = !greetingToday;
                    greetingToday = true;
                }

                finalMessages.push(obj);
            }

            data.messages = finalMessages;
            result[key][path.basename(file, '.json')] = data;
        }
    }

    return result;
};

init();
