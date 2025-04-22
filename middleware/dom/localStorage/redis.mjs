import { connect } from "jsr:@db/redis";


// make a connection to the local instance of redis  
class Storage {
    constructor( connection ) {
        this._connection = connection
    }

    async getItem(key) {
        const answer = await this._connection.get(String(key));
        return answer;
    }

    async setItem(key, val) {
        const answer = await this._connection.set(String(key), String(val));
        return answer;
    }

    removeItem(key) {
      this._connection.delete(key)
    }

    clear() {
      this._connection.clear()
    }

    key(i) {
        if (!arguments.length) {
            // this is a TypeError implemented on Chrome, Firefox throws Not enough arguments to Storage.key.
            throw new TypeError(
            "Failed to execute 'key' on 'Storage': 1 argument required, but only 0 present.",
            )
        }
        return Array.from(this._connection.keys())[i]
    }

    get length() {
        return this._connection.size
    }

    set length(val) {}
}

/*
const getterSetter = instance => ({
    set: function(obj, prop, value) {
        if (Storage.prototype.hasOwnProperty(prop)) {
            instance[prop] = value
        } else {
            instance.setItem(prop, value)
        }
        return true
    },
    get: function(target, name) {
        if (Storage.prototype.hasOwnProperty(name) || name === '__valuesMap') {
            return instance[name]
        }
        if (instance.__valuesMap.has(name)) {
            return instance.getItem(name)
        }
    },
})
    */

export default {
    createStorage: async ( configuration ) => {
        const redisConnection = await connect( configuration );
        const storage = new Storage( redisConnection );
        /*
        const restartCount = parseInt(await storage.getItem('restartCount') || 0) + 1;
        storage.setItem('restartCount', restartCount)
        console.log( `restart count is ${restartCount}`)
        */
        return storage;
    }
}

