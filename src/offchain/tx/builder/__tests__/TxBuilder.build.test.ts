import { Cbor } from "../../../../cbor/Cbor"
import { CborBytes } from "../../../../cbor/CborObj/CborBytes"
import { PScriptContext, V2, bool, data, int, lam, list, makeRedeemerValidator, makeValidator, pfn, pif, pmakeUnit, precursive, unit } from "../../../../onchain"
import { compile } from "../../../../onchain/pluts/Script/compile"
import { DataI, DataList } from "../../../../types/Data"
import { DataConstr } from "../../../../types/Data/DataConstr"
import { PaymentCredentials } from "../../../credentials/PaymentCredentials"
import { PubKeyHash } from "../../../credentials/PubKeyHash"
import { Address } from "../../../ledger/Address"
import { Value } from "../../../ledger/Value/Value"
import { defaultProtocolParameters } from "../../../ledger/protocol/ProtocolParameters"
import { Script, ScriptType } from "../../../script/Script"
import { Tx, getNSignersNeeded } from "../../Tx"
import { UTxO } from "../../body/output/UTxO"
import { TxBuilder } from "../TxBuilder"

jest.setTimeout(2_000_000)

const txBuilder = new TxBuilder(
    "testnet",
    defaultProtocolParameters
)

const pkAddr = new Address(
    "testnet",
    new PaymentCredentials(
        "pubKey",
        new PubKeyHash( "1b372f69".repeat(7) )
    )
)

const succeedScript = new Script(
    ScriptType.PlutusV2,
    Cbor.encode(
        new CborBytes(
            Cbor.encode(
                new CborBytes(

                    compile(
                        pfn([
                            data,
                            data,
                            V2.PScriptContext.type
                        ],  unit)
                        (( dat, rdmr, ctx) => pmakeUnit() )
                    )
                    
                )
            ).toBuffer()
        )
    ).toBuffer()
);

const succeedScriptAddr = new Address(
    "testnet",
    new PaymentCredentials(
        "script",
        succeedScript.hash
    )
)

describe("TxBuilder.build", () => {

    test("simple pub key input", async () => {

        const tx = await txBuilder.build({
            inputs: [
                {
                    utxo: new UTxO({
                        utxoRef: {
                            id: "ff".repeat(32),
                            index: 0
                        },
                        resolved: {
                            address: pkAddr,
                            value: Value.lovelaces( 10_000_000 )
                        }
                    })
                }
            ],
            changeAddress: pkAddr
        });

        expect( getNSignersNeeded( tx.body ) ).toEqual( 1 );
        
    });

    describe("simple spend script", () => {

        test("fails on missing script", async () => {

            let rejected = false;

            await txBuilder.build({
                inputs: [
                    {
                        utxo: new UTxO({
                            utxoRef: {
                                id: "ff".repeat(32),
                                index: 0
                            },
                            resolved: {
                                address: succeedScriptAddr,
                                value: Value.lovelaces( 10_000_000 )
                            }
                        })
                    }
                ],
                changeAddress: pkAddr
            }).catch( _ => rejected = true )

            expect( rejected ).toBe( true );
    
        });

        test("script included in transaction", async () => {

            const tx = await txBuilder.build({
                inputs: [
                    {
                        utxo: new UTxO({
                            utxoRef: {
                                id: "ff".repeat(32),
                                index: 0
                            },
                            resolved: {
                                address: succeedScriptAddr,
                                value: Value.lovelaces( 10_000_000 ),
                                datum: new DataConstr( 0, [] )
                            }
                        }),
                        inputScript: {
                            datum: "inline",
                            redeemer: new DataConstr( 0, [] ),
                            script: succeedScript
                        }
                    }
                ],
                changeAddress: pkAddr
            });

        });

        test("script included in transaction as reference script", async () => {

            const tx = await txBuilder.build({
                inputs: [
                    {
                        utxo: new UTxO({
                            utxoRef: {
                                id: "ff".repeat(32),
                                index: 0
                            },
                            resolved: {
                                address: succeedScriptAddr,
                                value: Value.lovelaces( 10_000_000 ),
                                datum: new DataConstr( 0, [] )
                            }
                        }),
                        referenceScriptV2: {
                            datum: "inline",
                            redeemer: new DataConstr( 0, [] ),
                            refUtxo: new UTxO({
                                utxoRef: {
                                    id: "ff".repeat(32),
                                    index: 0
                                },
                                resolved: {
                                    address: succeedScriptAddr,
                                    value: Value.lovelaces( 10_000_000 ),
                                    refScript: succeedScript
                                }
                            })
                        }
                    }
                ],
                changeAddress: pkAddr
            });

        });

        test("inline datum specified but none present", async () => {

            let rejected = false;
            // script in transaciton
            await txBuilder.build({
                inputs: [
                    {
                        utxo: new UTxO({
                            utxoRef: {
                                id: "ff".repeat(32),
                                index: 0
                            },
                            resolved: {
                                address: succeedScriptAddr,
                                value: Value.lovelaces( 10_000_000 ),
                                // datum: new DataConstr( 0, [] )
                            }
                        }),
                        inputScript: {
                            script: succeedScript,
                            datum: "inline",
                            redeemer: new DataConstr( 0, [] )
                        }
                    }
                ],
                changeAddress: pkAddr
            }).catch( _ => rejected = true )

            expect( rejected ).toBe( true );

            rejected = false;

            // reference script
            await txBuilder.build({
                inputs: [
                    {
                        utxo: new UTxO({
                            utxoRef: {
                                id: "ff".repeat(32),
                                index: 0
                            },
                            resolved: {
                                address: succeedScriptAddr,
                                value: Value.lovelaces( 10_000_000 ),
                                // datum: new DataConstr( 0, [] )
                            }
                        }),
                        referenceScriptV2: {
                            datum: "inline",
                            redeemer: new DataConstr( 0, [] ),
                            refUtxo: new UTxO({
                                utxoRef: {
                                    id: "ff".repeat(32),
                                    index: 0
                                },
                                resolved: {
                                    address: pkAddr,                // doesn't matter
                                    value: Value.lovelaces( 0 ),   // doesn't matter
                                    refScript: succeedScript
                                }
                            })
                        }
                    }
                ],
                changeAddress: pkAddr
            }).catch( _ => rejected = true )

            expect( rejected ).toBe( true );

        });

    });

    const pfactorial = precursive(
        pfn([
            lam( int, int ),
            int
        ],  int)
        (( self, n ) =>
            pif( int ).$( n.ltEq( 1 ) )
            .then( 1 )
            .else(
                n.mult( self.$( n.sub(1) ) )
            )
        )
    );

    const onlyBigThirdElem = pfn([
        data,
        list( int ),
        PScriptContext.type
    ],  bool)
    (( _dat, nums, _ctx ) => 
        nums.at(2)
        .gt( 
            pfactorial.$( 
                nums.at(1)
                .add( nums.at(0) )
            ) 
        ) 
    )

    const mintSomething = pfn([
        data,
        PScriptContext.type
    ],  bool)
    (( _rdmr, ctx ) => 
        ctx.extract("txInfo").in(({ txInfo }) => 
        txInfo.extract("inputs").in(({ inputs }) => 
            inputs.length.gtEq(2) 
        ))
    );

    const onlyBigThirdScript = new Script(
        ScriptType.PlutusV2,
        compile(
            makeValidator(
                onlyBigThirdElem
            )
        )
    );

    const onlyBigThirdAddr = new Address(
        "mainnet",
        new PaymentCredentials(
            "script",
            onlyBigThirdScript.hash
        )
    );

    const mintSomethingScript = new Script(
        ScriptType.PlutusV2,
        compile(
            makeRedeemerValidator(
                mintSomething
            )
        )
    );

    describe("big fat transactions", () => {

        let tx!: Tx;
        test("two scripts", async () => {

            // for( let i = 0; i < 5; i++ )
            tx = await txBuilder.build({
                inputs: [
                    {
                        utxo: new UTxO({
                            utxoRef: {
                                id: "ff".repeat(32),
                                index: 0
                            },
                            resolved: {
                                address: onlyBigThirdAddr,
                                value: Value.lovelaces( 10_000_000 ),
                                datum: new DataConstr( 0, [] )
                            }
                        }),
                        inputScript: {
                            datum: "inline",
                            redeemer: new DataList([
                                new DataI( 3 ),
                                new DataI( 4 ),
                                new DataI( (BigInt(1) << BigInt(64)) - BigInt(1) ),
                            ]),
                            script: onlyBigThirdScript
                        }
                    },
                    {
                        utxo: new UTxO({
                            utxoRef: {
                                id: "aa".repeat(32),
                                index: 0
                            },
                            resolved: {
                                address: Address.fake,
                                value: Value.lovelaces( 10_000_000 ),
                                datum: new DataConstr( 0, [] )
                            }
                        }),
                    }
                ],
                mints: [
                    {
                        value: new Value([
                            {
                                policy: mintSomethingScript.hash,
                                assets: { "hello": 2 }
                            }
                        ]),
                        script: {
                            inline: mintSomethingScript,
                            policyId: mintSomethingScript.hash,
                            redeemer: new DataI(0)
                        }
                    }
                ],
                changeAddress: pkAddr
            });

        });


    })
})