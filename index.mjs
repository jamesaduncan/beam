
import { parse, stringify } from "jsr:@std/toml";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { deepMerge as merge } from "jsr:@cross/deepmerge";
import * as path from "jsr:@std/path";
import HTTPStatusText from "./beam/http-status.mjs"


class Beam {

    static configuration = {
        configurationFilename: "beam.conf",
        prefix        : "/", 
        configPath    : "etc",
    
        VirtualHost   : {
            default: { 
                class: "VirtualHost",
                pipeline: ["./middleware/static.mjs"]
            }
        }    
    };

    static applicationArguments;

    static {
        this.applicationArguments = parseArgs( Deno.args );
        this.configuration.config = path.join( this.configuration.prefix, this.configuration.configPath, this.configuration.configurationFilename );
        delete this.applicationArguments["_"];        
        this.configuration = merge(this.configuration, this.applicationArguments);
        
        const decoder    = new TextDecoder("utf8");
        const configText = decoder.decode( Deno.readFileSync( this.configuration.config ));
        this.configuration = merge(this.configuration, parse( configText ));
        this.configuration.arguments = this.applicationArguments;        
    }

    static classes = {};

    static register( aClass ) {
        this.classes[ aClass.name ] = aClass;
    }

    static run() {
        Object.entries( this.configuration.VirtualHost ).forEach( ([ key, value ]) => {
            if (key == 'default') return;
            const constructorData = merge.withOptions({ arrayMergeStrategy: "replace" }, this.configuration.VirtualHost.default, this.configuration.VirtualHost[key]);
            const className = constructorData.class;
            const theClass  = this.classes[ className ];
            this.configuration.VirtualHost[key] = new theClass(constructorData);
        })

        /* process any virtualhost synonyms */
        Object.entries( this.configuration.VirtualHost ).forEach( ([key, value]) => {
            if ( value.synonyms ) {
                value.synonyms.forEach( (synonym) => {
                    this.configuration.VirtualHost[synonym] = value;            
                });
            }
        });
        const ac = new AbortController();
        const server = Deno.serve({
                onListen( opts ) {
                    console.log(`Server started at http://${opts.hostname}:${opts.port}`);
                },
                signal: ac.signal,
                hostname: this.configuration.listen,
                port: this.configuration.port
            },
            Beam.serve
        );
        server.finished.then(() => console.log("Server closed"));
    }

    static serve( aRequest ) {
        const url = new URL( aRequest.url);
        const vhost   = Beam.configuration.VirtualHost[ url.hostname ];
        return vhost.service( aRequest )
    }
}

class VirtualHost {

    static {
        Beam.register( this );
    }

    constructor(props) {
        Object.assign(this, merge(this, props));
    }

    async middleware () {
        if ( this._cached_pipeline_) {
            return this._cached_pipeline_;
        } else {
            return this._cached_pipeline_ ||= (await Promise.all( this.pipeline.map( async ( e ) => { return import(e) } ) ));
        }
    }

    async service( aRequest ) {
        const modules = await this.middleware();
        const context = {
            request : aRequest,
            response: new Response(null, { status: 204, statusText: HTTPStatusText[204]}),
        }
        for ( let i = 0; i<modules.length; i++ ) {
            try {
                const response = await modules[i].default.apply( this, [ context ]);
                if ( response instanceof Response ) {
                    context.response = response;
                }
            } catch (e) {
                return new Response(`<h1>Internal Server Error<h1><p>${e}</p>`, { status: 500, headers: {
                    "content-type": "text/html"
                }})
            }
        }
        return context.response;
    }
}


if ( Beam.configuration.arguments["verbose"])
    console.log( Beam.configuration );

Beam.run();

