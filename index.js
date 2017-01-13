
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const DIR = 'archive';

const USERS = {
    'U0B3HRP2A': 'Jessie',
    'U0B3JPJ0G': 'Sam',
    'U0B3HRP2A': 'Stefan',
    'U0B3WUEP6': 'Xuan',
};

const init = () => {
    const data = readData();
    console.log(analyze(data.direct_messages.sam));
};

const analyze = ({channel_info: {members}, messages}) => {
    const userMap = {};
    for (let id of members) {
        userMap[id] = {
            name: USERS[id],
            messages: [],
            words: [],
        };
    }

    for (let msg of messages) {
        const obj = userMap[msg.user];
        if (!obj) continue;
        obj.messages.push(msg);
        obj.words.push(...msg.words);
    }

    const formatNum = num => Math.round(num * 100) / 100;
    for (let user in userMap) {
        const obj = userMap[user];
        const {messages, words} = obj;
        const count = messages.length;
        obj.averageMessageLength = formatNum(
            messages.reduce((sum, msg) => sum + msg.text.length, 0) / count
        );
        obj.averageWordsPerMessage = formatNum(words.length / count);

        const sortedMessages = Array.from(messages).sort((a, b) => b.text.length - a.text.length);
        obj.medianWordsPerMessage = sortedMessages[Math.round(sortedMessages.length / 2)].words.length;
        delete obj.messages;
        delete obj.words;
    }

    console.log(userMap)
};

const readData = () => {
    const result = {};
    const SPACE_REG = /\s+/;
    const TAG_REG = /<[^>]*>/g;
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

                obj.text = obj.text.replace(TAG_REG, '');
                obj.words = obj.text.split(SPACE_REG);
                const [time, count] = obj.ts.split('.')[0];
                obj.time = parseInt(time) * 1000;
                obj.datIndex = parseInt(count) - 1;

                finalMessages.push(obj);
            }
            data.messages = finalMessages;
            result[key][path.basename(file, '.json')] = data;
        }
    }
    return result;
};

init();
