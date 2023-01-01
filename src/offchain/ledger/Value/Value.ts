import { ByteString } from "../../..";
import Cbor from "../../../cbor/Cbor";
import CborBytes from "../../../cbor/CborObj/CborBytes";
import CborMap from "../../../cbor/CborObj/CborMap";
import CborNegInt from "../../../cbor/CborObj/CborNegInt";
import CborUInt from "../../../cbor/CborObj/CborUInt";
import CborString from "../../../cbor/CborString";
import { ToCbor } from "../../../cbor/interfaces/CBORSerializable";
import DataB from "../../../types/Data/DataB";
import DataI from "../../../types/Data/DataI";
import DataMap from "../../../types/Data/DataMap";
import DataPair from "../../../types/Data/DataPair";
import { ToData } from "../../../types/Data/toData/interface";
import Cloneable from "../../../types/interfaces/Cloneable";
import BufferUtils, { Ord } from "../../../utils/BufferUtils";
import JsRuntime from "../../../utils/JsRuntime";
import ObjectUtils from "../../../utils/ObjectUtils";
import Hash32 from "../../hashes/Hash32/Hash32";
import { IValuePolicyEntry, IValueAdaEntry, isIValue, addIValues, subIValues, cloneIValueEntry } from "./IValue";

export type IValue = (IValuePolicyEntry | IValueAdaEntry)[]

function cloneIValue( ival: IValue ): IValue
{
    return ival.map( cloneIValueEntry );
}

function policyToString( policy: "" | Hash32 ): string
{
    return policy === "" ? policy : policy.asString;
}

export class Value
    implements ToCbor, Cloneable<Value>, ToData
{
    readonly map!: IValue

    constructor( map: IValue )
    {
        if(!isIValue( map )) console.log( map );
        
        JsRuntime.assert(
            isIValue( map ),
            "invalid value interface passed to contruct a 'value' instance"
        );

        map.forEach( entry => {

            const assets = entry.assets as any;

            ObjectUtils.freezeAll( assets );
            Object.freeze( entry.policy );
        });

        // value MUST have an ada entry
        if( !map.some( entry => entry.policy === "" ) )
        {
            map.unshift({
                policy: "",
                assets: { "": 0 }
            });
        }

        map.sort((a,b) => {
            if( a.policy === "" )
            {
                if( b.policy === "" ) return Ord.EQ;
                return Ord.LT;
            };
            if( b.policy === "" )
            {
                return Ord.GT;
            }
            return BufferUtils.lexCompare( a.policy.asBytes, b.policy.asBytes );
        });

        ObjectUtils.defineReadOnlyProperty(
            this,
            "map",
            Object.freeze( map )
        );
    }

    clone(): Value
    {
        return new Value( cloneIValue(this.map ) )
    }

    toData(): DataMap<DataB,DataMap<DataB,DataI>>
    {
        return new DataMap<DataB,DataMap<DataB,DataI>>(
            this.map.map( ({ policy, assets }) =>
                new DataPair(
                    new DataB( new ByteString( policy === "" ? "" : policy.asBytes ) ),
                    new DataMap(
                        Object.keys( assets ).map( assetName =>
                            new DataPair(
                                new DataB(
                                    ByteString.fromAscii( assetName )
                                ),
                                new DataI( assets[ assetName ] )
                            )
                        )
                    )
                )
            )
        )
    }

    static get zero(): Value
    {
        return Value.lovelaces( 0 )
    }

    static isZero( v: Value ): boolean
    {
        return (
            v.map.length === 0 ||
            v.map.every(({ assets }) =>
                Object.keys( assets ).every( name =>
                    BigInt((assets as any)[name]) === BigInt(0) 
                ) 
            )
        )
    }

    static lovelaces( n: number | bigint ): Value
    {
        return new Value([{
            policy: "",
            assets: { "": typeof n === "number" ? Math.round( n ) : BigInt( n ) }
        }]);
    }

    static add( a: Value, b: Value ): Value
    {
        return new Value( addIValues( a.map, b.map ) );
    }

    static sub( a: Value, b: Value ): Value
    {
        return new Value( subIValues( a.map, b.map ) );
    }
    
    toCbor(): CborString
    {
        return Cbor.encode( this.toCborObj() );
    }
    toCborObj(): CborMap
    {
        return new CborMap(
            this.map.map( entry => {
                const assets = entry.assets;
                const policy = entry.policy;
                return {
                    k: policy === "" ? new CborBytes(Buffer.from("","hex")) : policy.toCborObj(),
                    v: new CborMap(
                        Object.keys( assets ).map( assetNameAscii => {
                            const amt = (assets as any)[ assetNameAscii ];
                            return {
                                k: new CborBytes( Buffer.from( assetNameAscii, "ascii" ) ),
                                v: amt < 0 ? new CborNegInt( amt ) : new CborUInt( amt )
                            };
                        })
                    )
                };
            })
        );
    }
}

export default Value;
