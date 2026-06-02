import { sjcl } from './sjcl.js';

const pass =  navigator.appName + navigator.language + navigator.platform;
const salt = sjcl.codec.base64.fromBits(sjcl.hash.sha256.hash(navigator.appName));
const decoderRing = sjcl.codec.hex.fromBits(sjcl.misc.pbkdf2(pass, salt));

const encryptSettingKeys = settings => {
    /*
    * Given full settings object, walk servers, and encrypt the apiToken and password fields
    * Returns settings object with encrypted fields
    */
    for (let serverIndex in settings["servers"]) {
        settings.servers[serverIndex].apiToken = sjcl.encrypt(decoderRing, settings.servers[serverIndex].apiToken)
        settings.servers[serverIndex].pass = sjcl.encrypt(decoderRing, settings.servers[serverIndex].pass)
    }

    return settings;
}

const decryptSettings = encryptedData => {
    const decrypted = sjcl.decrypt(decoderRing, encryptedData);
    return decrypted;
}

export { encryptSettingKeys, decryptSettings}