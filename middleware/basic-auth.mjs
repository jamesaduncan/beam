import { parse } from "jsr:@std/toml";
import { deepMerge as merge } from "jsr:@cross/deepmerge";
import * as path from "jsr:@std/path";
import { fileForContext } from "../beam/utils.mjs";
import { decodeBase64 } from "jsr:@std/encoding/base64";

class User {
    username;
    groups = [];    

    constructor( { username, groups } = { username: '', groups: [] } ) {
        this.username = username;
        this.groups = groups;
    }

    toString() {
        return this.username;
    }
}

class Authentication {
    static authenticate( configuration, context ) {
        const req = context.request;

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            // we return the user nobody
            return null;
        }


        const [type, auth] = authHeader.split(' ');

        if ( type === 'Basic') {
            const decoder = new TextDecoder();
            const [ username, password ]  = decoder.decode( decodeBase64( auth ) ).split(':');
            if ( configuration?.users[ username ] == password ) {
                const myGroups = [];
                for ( const [groupname, groupmembers] of Object.entries( configuration.groups ) ) {                    
                    if ( groupmembers.includes( username )) myGroups.push( groupname )
                }
                const user = new User({ username: username, groups: myGroups })
                return user;
            } else {
                return null;
            }
        }
        return new User({ username: 'default', groups: ['anybody']});
    }
}

class Authorization {
    #file;
    #configuration;
    #context;

    static async generateAuthfilePaths(config, context, user) {
        const file = await fileForContext(config, context);
        const parts = file.name.split(path.SEPARATOR_PATTERN);
        const root = path.normalize(config.root);
        if ( file.info.isFile ) {
            parts.pop();
        }

        const paths = [];
        while( path.join(...parts) != root ) {
            const copy = Array.from( parts );
            copy.push('.auth.conf');
            paths.push( path.join(...copy) );

            parts.pop();
        }
        paths.push( path.join( root, ".auth.conf") )
        
        return paths.reverse();
    }

    static async processAuthfile(config, file, authDetails) {
        const decoder = new TextDecoder('utf8')
        try {
            const configText = await Deno.readFile( file )
            if (configText) {
                const parsed  = parse( decoder.decode( configText ));
                const toMerge = {};
                for ( const [ key, value ] of Object.entries( parsed ) ) {
                    const parts = file.split(path.SEPARATOR_PATTERN);
                    parts.pop();
                    // recreate the auth entry with the full path
                    toMerge[`${path.join(...parts,key)}`] = value;
                }
                return merge(authDetails, toMerge);
            } else {
                return authDetails;
            }
        } catch(e) {
            // we don't care about failed reads //
        }
        return authDetails;
    }

    static checkAllowances( filename, allowances ) {
        console.log(`in checkAllowances`);
        const matchingKey = Object.keys( allowances ).find( (a) => {
            console.log( `checking ${a} against ${filename} `)
            return (a == filename);
        });
        if ( matchingKey ) {
            return allowances[ matchingKey ]
        } else {            
            return this.checkAllowances( path.join(...filename.split(path.SEPARATOR_PATTERN).slice(0, -1)), allowances );
        }
    }

    static async authorized(config, context, user) {
        let allowances = {};
        const paths = await this.generateAuthfilePaths( config, context, user );
        for ( const path of paths ) {
            allowances = await this.processAuthfile(config, path, allowances);
        }

        console.log( `File is`, context.request.file.name)
        console.log( `Allowances are`, allowances )
        console.log( `User is`, user )

        const fail = this.fail( config, context, user );
        const applicableAllowance = this.checkAllowances( context.request.file.name, allowances );
        if ( !user && Object.keys(applicableAllowance) ) {
            return fail;
        } else if ( user && Object.keys( applicableAllowance ) ) {
            if ( applicableAllowance[ user.username ] != true ) return fail;
        }
        console.log("Authorization is good");
    }

    static fail(config, context, user) {
        const headers = new Headers();
        headers.set('WWW-Authenticate', `Basic realm="${config.realm}"`)
        const response = new Response("Unauthorized", {
            status: 401,
            headers
        });
        return response;        
    }
}

export default async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url); 
    console.log( `request for ${url}`)
    const user = await Authentication.authenticate( this, ctx );

    return await Authorization.authorized( this, ctx, user );
};

