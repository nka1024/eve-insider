
const yaml = require('js-yaml');
const { readFileSync, lstatSync, readdirSync } = require('fs')
const { join } = require('path')

const isDirectory = source => lstatSync(source).isDirectory()
const getDirectories = source =>
    readdirSync(source).map(name => join(source, name)).filter(isDirectory)

module.exports = {
    getSystems: () => {
        var systems = {};
        var path = 'sde/fsd/universe/eve';
    
        const dirTree = source => {
            var dirs = getDirectories(source)
            if (dirs.length == 0) {
                var sourceRel = source.replace(path + '/', '');
                let systemData = sourceRel.split('/');
                var sysData = yaml.safeLoad(readFileSync(source + '/solarsystem.staticdata', 'utf8'));
                systems[sysData.solarSystemID] = {
                    "security": sysData.security,
                    "name": systemData[2]
                };
            }
            else {
                dirs.forEach(dir => dirTree(dir));
            }
        };
        dirTree(path);
        return systems;
    }
};

// var s = module.exports.getSystems()
// console.log(s);

 
// console.log(JSON.stringify(systems));
// console.log(systems["Jita"]);
