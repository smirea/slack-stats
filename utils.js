
const unique = arr => {
    const map = {};
    for (let item of arr) map[item] = true;
    return Object.keys(map);
};

module.exports = {
    unique,
};
