module.exports = {
    log: (level, s) => {
        let allowed = [0,1,2,3];
        if (allowed.indexOf(level) >= 0) {
            console.log(s);
        }
    }
}