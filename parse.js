const yaml = require('js-yaml');
const fs = require('fs');
try {
    const config = yaml.safeLoad(fs.readFileSync('./custom_data/regions.yml', 'utf8'));
    // const config = yaml.safeLoad(fs.readFileSync('./sde/fsd/groupIDs.yaml', 'utf8'));
    // const config = yaml.safeLoad(fs.readFileSync('./sde/bsd/invUniqueNames.yaml', 'utf8'));
    const indentedJson = JSON.stringify(config, null, 4);
    // console.log(indentedJson);
    config.forEach(element => {
        if (element.groupID == 3)
            console.log(element);

    });
    // console.log(indentedJson.length);
    // console.log(indentedJson);
} catch (e) {
    console.log(e);
}
