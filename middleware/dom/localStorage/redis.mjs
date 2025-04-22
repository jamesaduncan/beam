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

export default {
    createStorage: async ( configuration ) => {
        const redisConnection = await connect( configuration );
        const storage = new Storage( redisConnection );
        return storage;
    }
}

