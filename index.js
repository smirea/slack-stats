
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const {unique} = require('./utils');
const metadata = require('./archive/metadata.json');

const DIR = 'archive';

const USERS = {
    'U0B3JPJ0G': 'sam',
    'U0B49717H': 'jessiewright',
    'U0B3WUEP6': 'xuan',
    'U35A7SYJW': 'dashalom',
    'U0B3HRP2A': 'stefan',
};

const SPACE_REG = /\s+/;
const TAG_REG = /<[^>]*>/g;
const GREETING_REG = /^(hello|hi|holla|howdy|sup|yo)[^a-z]*$/i;

const init = () => {
    const data = readData();
    analyze(data.private_channels.core);
};

const analyze = ({channel_info: {members}, messages}) => {
    const userMap = {};
    for (let id in USERS) {
        userMap[id] = {
            name: USERS[id],
            messages: [],
            words: [],
            blocks: [],
        };
    }

    for (let msg of messages) {
        const obj = userMap[msg.user];
        if (!obj) continue;
        obj.messages.push(msg);
        obj.words.push(...msg.words);
    }

    const BLOCK_DELTA = 10 * 1000;
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
        if (block.length <= 2) continue;
        userMap[msg.user].blocks.push(block);
    }

    const formatNum = num => Math.round(num * 100) / 100;
    const getMedian = arr => !arr.length ? null : arr[Math.round(arr.length / 2)];
    for (let user in userMap) {
        const obj = userMap[user];
        const {messages, words} = obj;

        obj.messageCount = messages.length;
        obj.averageMessageLength = 0;
        obj.greetingCount = 0;
        for (let msg of messages) {
            obj.averageMessageLength += msg.text.length;
            if (msg.isGreeting) ++obj.greetingCount;
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

    console.log(userMap)
};

const readData = () => {
    const result = {};
    for (let key of ['channels', 'direct_messages', 'private_channels']) {
        result[key] = {};
        const root = path.join(DIR, key);
        for (let file of fs.readdirSync(root)) {
            if (path.extname(file) !== '.json') continue;
            const data = JSON.parse('' + fs.readFileSync(path.join(root, file)));

            const finalMessages = [];
            for (let obj of data.messages) {
                // Completely exclude text blocks
                if (!obj.text || obj.text.includes('```')) continue;

                obj.text = obj.text.replace(TAG_REG, '').trim();
                if (!obj.text) continue;

                obj.words = obj.text.split(SPACE_REG);
                const [time, count] = obj.ts.split('.')[0];
                obj.time = parseInt(time) * 1000;
                obj.datIndex = parseInt(count) - 1;
                obj.isGreeting = GREETING_REG.test(obj.text);

                finalMessages.push(obj);
            }
            finalMessages.reverse(); // by default the messages are sorted new -> old, reverse that
            data.messages = finalMessages;
            result[key][path.basename(file, '.json')] = data;
        }
    }
    return result;
};

init();
