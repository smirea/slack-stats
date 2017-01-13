
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const {unique} = require('./utils');
const metadata = require('./archive/metadata.json');

const DIR = 'archive';

const USERS_TO_CHECK = [
    'dalit',
    'jessiewright',
    'sam',
    'stefan',
    'xuan',
];
const USERS = Object.keys(metadata.users).reduce((obj, key) =>
    Object.assign(obj, {[key]: metadata.users[key]})
, {});

const SPACE_REG = /\s+/;
const TAG_REG = /<[^>]*>/g;
const GREETING_REG = /^(hello|hi|holla|howdy|sup|yo)[^a-z]*$/i;

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

        obj.averageMessageLength = 0;
        obj.greetingCount = 0;
        for (let msg of messages) {
            obj.averageMessageLength += msg.text.length;
            if (msg.isGreeting) ++obj.greetingCount;
        }
        obj.averageMessageLength = formatNum(obj.averageMessageLength / count);

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
            data.messages = finalMessages;
            result[key][path.basename(file, '.json')] = data;
        }
    }
    return result;
};

init();
