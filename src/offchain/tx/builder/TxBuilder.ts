import JsRuntime from "../../../utils/JsRuntime";
import ObjectUtils from "../../../utils/ObjectUtils";

import type { NetworkT } from "../../ledger/Network";
import { costModelV1ToFakeV2, costModelsToCborObj, costModelsToLanguageViewCbor, defaultV1Costs, defaultV2Costs, isCostModelsV1, isCostModelsV2, toCostModelV2 } from "../../ledger/CostModels";
import { txBuildOutToTxOut } from "./txBuild/ITxBuildOutput";
import { forceBigUInt } from "../../../types/ints/Integer";
import { Script, ScriptType } from "../../script/Script";
import { ProtocolParamters, isPartialProtocolParameters } from "../../ledger/protocol/ProtocolParameters";
import { getTxInfos } from "./toOnChain/getTxInfos";
import { blake2b_256, byte } from "../../../crypto";
import { Tx, getNSignersNeeded } from "../Tx";
import { Machine, machineVersionV1, machineVersionV2 } from "../../../onchain/CEK/Machine";
import { CanBeData, canBeData, forceData } from "../../../types/Data/CanBeData";
import { ITxBuildArgs } from "./txBuild/ITxBuildArgs";
import { ITxBuildOptions, ITxBuildSyncOptions } from "./txBuild/ITxBuildOptions";
import { TxIn } from "../body/TxIn";
import { TxOut } from "../body/output/TxOut";
import { Value } from "../../ledger/Value/Value";
import { TxRedeemer, TxRedeemerTag, txRdmrTagToString, txRedeemerTagToString } from "../TxWitnessSet/TxRedeemer";
import { BasePlutsError } from "../../../errors/BasePlutsError";
import { VKeyWitness } from "../TxWitnessSet/VKeyWitness/VKeyWitness";
import { Data, isData } from "../../../types/Data/Data";
import { BootstrapWitness } from "../TxWitnessSet/BootstrapWitness";
import { ExBudget } from "../../../onchain/CEK/Machine/ExBudget";
import { AuxiliaryData } from "../AuxiliaryData/AuxiliaryData";
import { Hash32 } from "../../hashes/Hash32/Hash32";
import { CborString } from "../../../cbor/CborString";
import { dataToCbor, dataToCborObj } from "../../../types/Data/toCbor";
import { ScriptDataHash } from "../../hashes/Hash32/ScriptDataHash";
import { PureUPLCTerm, UPLCTerm } from "../../../onchain/UPLC/UPLCTerm";
import { UPLCDecoder } from "../../../onchain/UPLC/UPLCDecoder";
import { Application } from "../../../onchain/UPLC/UPLCTerms/Application";
import { UPLCConst } from "../../../onchain/UPLC/UPLCTerms/UPLCConst";
import { DataConstr } from "../../../types/Data/DataConstr";
import { ErrorUPLC } from "../../../onchain/UPLC/UPLCTerms/ErrorUPLC";
import { UTxO } from "../body/output/UTxO";
import { Hash28 } from "../../hashes/Hash28/Hash28";
import { CborPositiveRational } from "../../../cbor/extra/CborRational";
import { TxWitnessSet } from "../TxWitnessSet";
import { Cbor } from "../../../cbor/Cbor";
import { CborArray } from "../../../cbor/CborObj/CborArray";
import { isUint8Array, lexCompare, toHex } from "@harmoniclabs/uint8array-utils";

type ScriptLike = {
    hash: string,
    bytes: Uint8Array
}

const scriptCache: { [x: string]: UPLCTerm } = {};

function getScriptLikeUplc( scriptLike: ScriptLike ): UPLCTerm
{
    let script: UPLCTerm;
    if(
        (script = scriptCache[scriptLike.hash]) === undefined
    )
    {
        script = UPLCDecoder.parse(
            scriptLike.bytes,
            "flat"
        ).body;
        Object.defineProperty(
            scriptCache, scriptLike.hash, {
                value: script,
                writable: false,
                enumerable: true,
                configurable: false
            }
        )
    }

    return script;
}

export class TxBuilder
{
    readonly network!: NetworkT
    readonly protocolParamters!: ProtocolParamters
    
    constructor( network: NetworkT, protocolParamters: Readonly<ProtocolParamters> )
    {
        JsRuntime.assert(
            network === "testnet" ||
            network === "mainnet",
            "invlaid 'network' argument while constructing a 'TxBuilder' instance"
        );
        ObjectUtils.defineReadOnlyProperty(
            this,
            "network",
            network
        );

        JsRuntime.assert(
            isPartialProtocolParameters( protocolParamters ),
            "invlaid 'protocolParamters' argument while constructing a 'TxBuilder' instance"
        );
        ObjectUtils.defineReadOnlyProperty(
            this,
            "protocolParamters",
            ObjectUtils.freezeAll( protocolParamters )
        );

        const costmdls = protocolParamters.costModels;
        const cekVersion =
            isCostModelsV2( costmdls.PlutusScriptV2 ) ? machineVersionV2 :
            isCostModelsV1( costmdls.PlutusScriptV1 ) ? machineVersionV1 : "none";
        const costs = cekVersion === machineVersionV2 ?
            costmdls.PlutusScriptV2 ?? defaultV2Costs :
            costmdls.PlutusScriptV1 ?? defaultV1Costs;

        let _costCbor: Uint8Array | undefined = undefined;
        const getCostsCbor = (): Uint8Array => {
            if( !(_costCbor instanceof Uint8Array) )
            _costCbor = Cbor.encode(
                costModelsToCborObj({
                    PlutusScriptV2: isCostModelsV2( costs ) ? 
                        toCostModelV2( costs ) : 
                        costModelV1ToFakeV2( costs )
                }) 
            ).toBuffer();

            return _costCbor;
        }

        if( cekVersion !== "none" )
        ObjectUtils.definePropertyIfNotPresent(
            this,
            "cek",
            {
                // define as getter so that it can be reused without messing around things
                get: () => new Machine(
                    cekVersion,
                    costs
                ),
                // set does nothing ( aka. readonly )
                set: ( ...whatever: any[] ) => {},
                enumerable: false,
                configurable: false
            }
        );

        ///////////////////////////////////////////////////////////////////////////////////////
        // --------------------------------  private stuff  -------------------------------- //
        // -------------------------------- AND things that -------------------------------- //
        // -------------------------------- needs to access -------------------------------- //
        // --------------------------------  private stuff  -------------------------------- //
        ///////////////////////////////////////////////////////////////////////////////////////

        ObjectUtils.defineReadOnlyProperty(
            this, "build",
            async (
                buildArgs: ITxBuildArgs,
                buildOpts: ITxBuildOptions = {}
            ): Promise<Tx> => {

                return this.buildSync( buildArgs, buildOpts )
            }
        )
    }

    calcLinearFee( tx: Tx | CborString ): bigint
    {
        return (
            forceBigUInt( this.protocolParamters.txFeePerByte ) *
            BigInt( (tx instanceof Tx ? tx.toCbor() : tx ).toBuffer().length ) +
            forceBigUInt( this.protocolParamters.txFeeFixed )
        );
    }

    /**
     * here mainly for forward compability
     * 
     * internally calls `buildSync` so really what `build` is doing is wrapping it in a `Promise`
     * 
     * In future this method might implement multi-threadung using `Worker`s
     */
    build!: (args: ITxBuildArgs, opts?: ITxBuildOptions) => Promise<Tx>

    buildSync(
        buildArgs: ITxBuildArgs,
        {
            onScriptInvalid,
            onScriptResult
        }: ITxBuildSyncOptions = {}
    ): Tx
    {
        let {
            tx,
            scriptsToExec,
            minFee,
            datumsScriptData,
            languageViews,
            totInputValue,
            requiredOutputValue,
            outs
        } = initTxBuild.bind( this )( buildArgs );

        const txOuts: TxOut[] = new Array( outs.length + 1 );

        const rdmrs = tx.witnesses.redeemers ?? [];
        const nRdmrs = rdmrs.length;

        if( nRdmrs === 0 ) return tx;

        const cek: Machine = (this as any).cek;
        
        if( !(cek instanceof Machine) )
        throw new BasePlutsError(
            "unable to construct transaction including scripts " +
            "if the protocol params are missing the script evaluation costs"
        )

        const executionUnitPrices = this.protocolParamters.executionUnitPrices;
        const [ memRational, cpuRational ] = Array.isArray( executionUnitPrices ) ?
            executionUnitPrices :
            [
                CborPositiveRational.fromNumber( executionUnitPrices.priceSteps  ),
                CborPositiveRational.fromNumber( executionUnitPrices.priceMemory )
            ];

        const spendScriptsToExec =      scriptsToExec.filter( elem => elem.rdmrTag === TxRedeemerTag.Spend );
        const mintScriptsToExec =       scriptsToExec.filter( elem => elem.rdmrTag === TxRedeemerTag.Mint );
        const certScriptsToExec =       scriptsToExec.filter( elem => elem.rdmrTag === TxRedeemerTag.Cert );
        const withdrawScriptsToExec =   scriptsToExec.filter( elem => elem.rdmrTag === TxRedeemerTag.Withdraw );

        const maxRound = 3;

        let _isScriptValid: boolean = true;
        let fee = minFee;
        let prevFee: bigint;

        for( let round = 0; round < maxRound; round++ )
        {
            prevFee = fee;

            const { v1: txInfosV1, v2: txInfosV2 } = getTxInfos( tx );

            let totExBudget = new ExBudget({ mem: 0, cpu: 0 });

            for( let i = 0 ; i < nRdmrs; i++)
            {
                const rdmr = rdmrs[i];
                const { tag, data: rdmrData, index: rdmr_idx } = rdmr;
                // "+ 1" because we keep track of lovelaces even if in mint values these are 0
                const index = rdmr_idx + (tag === TxRedeemerTag.Mint ? 1 : 0);
                const spendingPurpose = rdmr.toSpendingPurposeData( tx.body );

                const onlyRedeemerArg = ( purposeScriptsToExec: ScriptToExecEntry[] ) =>
                {
                    const script = purposeScriptsToExec.find( ({ index: idx }) => idx === index )?.script;

                    if( script === undefined )
                    throw new BasePlutsError(
                        "missing script for " + txRdmrTagToString(tag) + " redeemer " + (index - 1)
                    );

                    const ctxData = getCtx(
                        script.type,
                        spendingPurpose,
                        txInfosV1,
                        txInfosV2
                    );

                    const { result, budgetSpent, logs } = cek.eval(
                        new Application(
                            new Application(
                                getScriptLikeUplc( script ),
                                UPLCConst.data( rdmrData )
                            ),
                            UPLCConst.data(
                                ctxData
                            )
                        )
                    );

                    _isScriptValid = onEvaluationResult(
                        i,
                        totExBudget,
                        rdmr,
                        result,
                        budgetSpent,
                        logs,
                        [
                            rdmrData,
                            ctxData
                        ],
                        rdmrs,
                        onScriptResult,
                        onScriptInvalid
                    );
                }

                if( tag === TxRedeemerTag.Spend )
                {
                    const entry = spendScriptsToExec.find( ({ index: idx }) => idx === index );

                    if( entry === undefined )
                    throw new BasePlutsError(
                        "missing script for spend redeemer " + index
                    );

                    const { script, datum } = entry;

                    if( datum === undefined )
                    throw new BasePlutsError(
                        "missing datum for spend redeemer " + index
                    );

                    const ctxData = getCtx(
                        script.type,
                        spendingPurpose,
                        txInfosV1,
                        txInfosV2
                    );

                    const { result, budgetSpent, logs } = cek.eval(
                        new Application(
                            new Application(
                                new Application(
                                    getScriptLikeUplc( script ),
                                    UPLCConst.data( datum )
                                ),
                                UPLCConst.data( rdmrData )
                            ),
                            UPLCConst.data(
                                ctxData
                            )
                        )
                    );

                    _isScriptValid = onEvaluationResult(
                        i,
                        totExBudget,
                        rdmr,
                        result,
                        budgetSpent,
                        logs,
                        [
                            datum,
                            rdmrData,
                            ctxData
                        ],
                        rdmrs,
                        onScriptResult,
                        onScriptInvalid
                    );
                }
                else if( tag === TxRedeemerTag.Mint )       onlyRedeemerArg( mintScriptsToExec )
                else if( tag === TxRedeemerTag.Cert )       onlyRedeemerArg( certScriptsToExec )
                else if( tag === TxRedeemerTag.Withdraw )   onlyRedeemerArg( withdrawScriptsToExec )
                else throw new BasePlutsError(
                    "unrecoignized redeemer tag " + tag
                )
            }

            fee = minFee +
                ((totExBudget.mem * memRational.num) / memRational.den) +
                ((totExBudget.cpu * cpuRational.num) / cpuRational.den) +
                // bigint division truncates always towards 0;
                // we don't like that so we add 1n for both divisions ( + 2n )
                BigInt(2);

            if( fee === prevFee ) break; // return last transaciton

            // reset for next loop
            
            // no need to reset if there's no next loop
            if( round === maxRound - 1 ) break;

            outs.forEach( (txO, i) => txOuts[i] = txO.clone() );
            txOuts[ txOuts.length - 1 ] = (
                new TxOut({
                    address: buildArgs.changeAddress,
                    value: Value.sub(
                        totInputValue,
                        Value.add(
                            requiredOutputValue,
                            Value.lovelaces( fee )
                        )
                    )
                })
            );

            tx = new Tx({
                ...tx,
                body: {
                    ...tx.body,
                    outputs: txOuts,
                    fee: fee,
                    scriptDataHash: getScriptDataHash( rdmrs, datumsScriptData, languageViews )
                },
                witnesses: {
                    ...tx.witnesses,
                    redeemers: rdmrs,
                },
                isScriptValid: _isScriptValid
            });

            _isScriptValid = true;
            totExBudget = new ExBudget({ mem: 0, cpu: 0 })
        }

        return tx;
    }
}

type ScriptToExecEntry = {
    rdmrTag: TxRedeemerTag,
    index: number,
    script: {
        type: ScriptType,
        bytes: Uint8Array,
        hash: string
    },
    datum?: Data
};

/**
 * extracts the important data from the input
 * and returns it in an easier way to opearte with
 * 
 * it the transaction is simple enough (aka. it doesn't include plutus scripts)
 * this is all that either `build` or `buildSync` needs to do
**/
function initTxBuild(
    this: TxBuilder,
    {
        inputs,
        changeAddress,
        outputs,
        readonlyRefInputs,
        requiredSigners,
        collaterals,
        collateralReturn,
        mints,
        invalidBefore,
        invalidAfter,
        certificates,
        withdrawals,
        metadata,
        protocolUpdateProposal
    }: ITxBuildArgs
) : {
    tx: Tx,
    scriptsToExec: ScriptToExecEntry[],
    minFee: bigint,
    datumsScriptData: number[],
    languageViews: Uint8Array,
    totInputValue: Value,
    requiredOutputValue: Value,
    outs: TxOut[]
}
{

    let totInputValue = mints?.reduce( ( prev, curr ) => Value.add( prev, curr.value ), Value.zero ) ?? Value.zero;
    const refIns: UTxO[] = readonlyRefInputs?.slice() ?? [];

    const outs = outputs?.map( txBuildOutToTxOut ) ?? [];
    const requiredOutputValue = outs.reduce( (acc, out) => Value.add( acc, out.value ), Value.zero );

    const undef: undefined = void 0;

    const vkeyWitnesses: VKeyWitness[] = [];
    const nativeScriptsWitnesses: Script<ScriptType.NativeScript>[] = [];
    const bootstrapWitnesses: BootstrapWitness[] = [];
    const plutusV1ScriptsWitnesses: Script<ScriptType.PlutusV1>[] = [];
    const datums: Data[] = []
    const plutusV2ScriptsWitnesses: Script<ScriptType.PlutusV2>[] = [];
    
    const dummyExecBudget = ExBudget.maxCborSize;

    const spendRedeemers: TxRedeemer[] = [];
    const mintRedeemers: TxRedeemer[] = [];
    const certRedeemers: TxRedeemer[] = [];
    const withdrawRedeemers: TxRedeemer[] = [];

    const scriptsToExec: ScriptToExecEntry[] = [];

    function pushScriptToExec( idx: number, tag: TxRedeemerTag, script: Script, datum?: Data )
    {
        if( script.type !== ScriptType.NativeScript )
        {
            scriptsToExec.push({
                index: idx,
                rdmrTag: tag,
                script: {
                    type: script.type,
                    bytes: script.bytes.slice(),
                    hash: script.hash.toString()
                },
                datum
            })
        }
    }

    function pushWitScript( script : Script ): void
    {
        const t = script.type;
        
        if( t === ScriptType.NativeScript  )     nativeScriptsWitnesses  .push( script as any );
        else if( t === ScriptType.PlutusV1 )     plutusV1ScriptsWitnesses.push( script as any );
        else if( t === ScriptType.PlutusV2 )     plutusV2ScriptsWitnesses.push( script as any );
    }

    /**
     * @returns `Script` to execute
     */
    function checkScriptAndPushIfInline( script: { inline: Script } | { ref: UTxO } ): Script
    {
        if( ObjectUtils.hasOwn( script, "inline" ) )
        {
            if( ObjectUtils.hasOwn( script, "ref" ) )
            throw new BasePlutsError(
                "multiple scripts specified"
            );

            pushWitScript( script.inline );

            return script.inline;
        }
        if( ObjectUtils.hasOwn( script, "ref" ) )
        {
            if( ObjectUtils.hasOwn( script, "inline" ) )
            throw new BasePlutsError(
                "multiple scripts specified"
            );

            const refScript = (script.ref as UTxO).resolved.refScript;

            if( refScript === (void 0) )
            throw new BasePlutsError(
                "script was specified to be a reference script " +
                "but the provided utxo is missing any attached script"
            );

            refIns.push( script.ref );
            return refScript;
        }

        throw "unexpected execution flow 'checkScriptAndPushIfInline' in TxBuilder"
    }

    /**
     * 
     * @param datum 
     * @param inlineDatum 
     * @returns the `Data` of the datum
     */
    function pushWitDatum(
        datum: CanBeData | "inline",
        inlineDatum: CanBeData | Hash32 | undefined
    ): Data
    {
        if( datum === "inline" )
        {
            if( !canBeData( inlineDatum ) )
            throw new BasePlutsError(
                "datum was specified to be inline; but inline datum is missing"
            );

            // no need to push to witnesses

            return forceData( inlineDatum );
        }
        else
        {
            const dat = forceData( datum );

            // add datum to witnesses
            // the node finds it trough the datum hash (on the utxo)
            datums.push( dat );

            return dat;
        }
    }

    let isScriptValid: boolean = true;

    const _inputs = inputs.map( ({
        utxo,
        referenceScriptV2,
        inputScript
    }, i) => {
        
        const addr = utxo.resolved.address;

        totInputValue =  Value.add( totInputValue, utxo.resolved.value );

        if(
            addr.paymentCreds.type === "script" &&
            referenceScriptV2 === undef &&
            inputScript === undef
        )
        throw new BasePlutsError(
            "spending script utxo \"" + utxo.utxoRef.toString() + "\" without script source"
        );

        if( referenceScriptV2 !== undef )
        {
            if( inputScript !== undef )
            throw new BasePlutsError(
                "invalid input; multiple scripts specified"
            );

            const {
                datum,
                redeemer,
                refUtxo
            } = referenceScriptV2;

            const refScript = refUtxo.resolved.refScript;

            if( refScript === undefined )
            throw new BasePlutsError(
                "reference utxo specified (" + refUtxo.toString() + ") is missing an attached reference Script"
            )

            refIns.push( refUtxo );

            const dat = pushWitDatum( datum, utxo.resolved.datum );

            spendRedeemers.push(new TxRedeemer({
                data: forceData( redeemer ),
                index: i,
                execUnits: dummyExecBudget.clone(),
                tag: TxRedeemerTag.Spend
            }));

            pushScriptToExec( i, TxRedeemerTag.Spend, refScript, dat );
            
        }
        if( inputScript !== undefined )
        {
            if( referenceScriptV2 !== undefined )
            throw new BasePlutsError(
                "invalid input; multiple scripts specified"
            );

            const {
                datum,
                redeemer,
                script
            } = inputScript;

            pushWitScript( script );

            const dat = pushWitDatum( datum, utxo.resolved.datum ); 

            spendRedeemers.push(new TxRedeemer({
                data: forceData( redeemer ),
                index: i,
                execUnits: dummyExecBudget.clone(),
                tag: TxRedeemerTag.Spend
            }));
            
            pushScriptToExec( i, TxRedeemerTag.Spend, script, dat );

        }

        return new TxIn( utxo )
    }) as [TxIn, ...TxIn[]];
    
    // good luck spending more than 4294.967295 ADA in fees
    // also 16.777215 ADA (3 bytes) is a lot; but CBOR only uses 2 or 4 bytes integers
    // and 2 are ~0.06 ADA (too low) so go for 4;
    const dummyFee = BigInt( "0xffffffff" );

    const dummyOuts = outs.map( txO => txO.clone() )

    // add dummy change address output
    dummyOuts.push(
        new TxOut({
            address: changeAddress,
            value: Value.sub(
                totInputValue,
                Value.add(
                    requiredOutputValue,
                    Value.lovelaces(
                        forceBigUInt(
                            this.protocolParamters.txFeePerByte 
                        )
                    )
                )
            )
        })
    );

    // index to be modified
    const dummyMintRedeemers: [ Hash32, Script, TxRedeemer ][] = [];

    const _mint: Value | undefined = mints?.reduce( (accum, {
            script,
            value
        }, i ) => {

            const redeemer = script.redeemer;
            const policyId = script.policyId;

            const toExec = checkScriptAndPushIfInline( script );

            dummyMintRedeemers.push([
                policyId,
                toExec,
                new TxRedeemer({
                    data: forceData( redeemer ),
                    index: i, // to be modified as `indexOfPolicy( policyId )`
                    execUnits: dummyExecBudget.clone(),
                    tag: TxRedeemerTag.Mint
                })
            ]);

            if( !(value.lovelaces === BigInt(0)) )
            {
                throw new BasePlutsError("mint value containing non-zero ADA; lovelaces can't be minted or burned")
            }

            return Value.add( accum, value )   
        },
        Value.zero
    );

    function indexOfPolicy( policy: Hash32 ): number
    {
        const policyStr = policy.toString();
        return _mint?.map.findIndex( entry => entry.policy.toString() === policyStr ) ?? -1;
    }

    dummyMintRedeemers.forEach( ([ policy, toExec, dummyRdmr ]) => {

        const i = indexOfPolicy( policy );

        mintRedeemers.push(new TxRedeemer({
            data: dummyRdmr.data,
            index: i - 1, // "- 1" because final value will exclude lovelaces (can't mint or burn ADA)
            execUnits: dummyRdmr.execUnits,
            tag: TxRedeemerTag.Mint
        }));

        pushScriptToExec( i, TxRedeemerTag.Mint, toExec );

    })

    const _certs = certificates?.map( ({
        cert,
        script
    }, i) => {
        if( script !== undef )
        {
            certRedeemers.push(new TxRedeemer({
                data: forceData( script.redeemer ),
                index: i,
                execUnits: dummyExecBudget.clone(),
                tag: TxRedeemerTag.Cert
            }));

            const toExec = checkScriptAndPushIfInline( script );

            pushScriptToExec( i, TxRedeemerTag.Cert, toExec );

        }
        return cert;
    })

    const _wits = withdrawals
    ?.sort( ({ withdrawal: fst }, { withdrawal: snd }) =>
        lexCompare(
            fst.rewardAccount instanceof Hash28 ?
                fst.rewardAccount.toBuffer() :
                fst.rewardAccount.credentials.toBuffer(),
            snd.rewardAccount instanceof Hash28 ?
                snd.rewardAccount.toBuffer() :
                snd.rewardAccount.credentials.toBuffer()
        )
    )
    .map( ({
        withdrawal,
        script
    },i) => {

        if( script !== undef )
        {
            withdrawRedeemers.push(new TxRedeemer({
                data: forceData( script.redeemer ),
                index: i,
                execUnits: dummyExecBudget.clone(),
                tag: TxRedeemerTag.Withdraw
            }));

            const toExec = checkScriptAndPushIfInline( script );

            pushScriptToExec( i, TxRedeemerTag.Withdraw, toExec );
        }

        return withdrawal; 
    })

    const auxData = metadata !== undefined? new AuxiliaryData({ metadata }) : undefined;

    const redeemers =
        spendRedeemers
        .concat( mintRedeemers )
        .concat( withdrawRedeemers )
        .concat( certRedeemers );
    
    const dummyTxWitnesses = new TxWitnessSet({
        vkeyWitnesses,
        bootstrapWitnesses,
        datums,
        redeemers,
        nativeScripts: nativeScriptsWitnesses,
        plutusV1Scripts: plutusV1ScriptsWitnesses,
        plutusV2Scripts: plutusV2ScriptsWitnesses
    });

    const datumsScriptData =
        datums.length > 0 ?
            Array.from(
                Cbor.encode(

                    new CborArray(
                        datums.map( dataToCborObj )
                    )
                    
                ).toBuffer()
            ) 
        : [];

    const languageViews = costModelsToLanguageViewCbor(
        this.protocolParamters.costModels,
        {
            mustHaveV1: plutusV1ScriptsWitnesses.length > 0,
            mustHaveV2: plutusV2ScriptsWitnesses.length > 0
        }
    ).toBuffer();

    const dummyTx = new Tx({
        body: {
            inputs: _inputs,
            outputs: dummyOuts,
            fee: dummyFee,
            mint: _mint,
            certs: _certs,
            withdrawals: _wits,
            refInputs: refIns.length === 0 ? undef : refIns.map( refIn => refIn instanceof TxIn ? refIn : new TxIn( refIn ) ),
            protocolUpdate: protocolUpdateProposal,
            requiredSigners,
            collateralInputs: collaterals,
            collateralReturn:
                collateralReturn === undef ? 
                undef : 
                txBuildOutToTxOut( collateralReturn ),
            totCollateral: undef,
            validityIntervalStart:
                invalidBefore === undef ?
                undef :
                forceBigUInt( invalidBefore ),
            ttl:
                (
                    invalidBefore === undef ||
                    invalidAfter === undef
                ) ?
                undef :
                forceBigUInt( invalidAfter ) - forceBigUInt( invalidBefore ),
            auxDataHash: auxData?.hash,
            scriptDataHash: getScriptDataHash( redeemers, datumsScriptData, languageViews ),
            network: this.network
        },
        witnesses: dummyTxWitnesses,
        auxiliaryData: auxData,
        isScriptValid
    });

    const minFeeMultiplier = forceBigUInt( this.protocolParamters.txFeePerByte );

    const nVkeyWits = BigInt( getNSignersNeeded( dummyTx.body ) );

    const minFee = this.calcLinearFee( dummyTx ) +
        // consider also vkeys witnesses to be added
        // each vkey witness has fixed size of 102 cbor bytes
        // (1 bytes cbor array tag (length 2)) + (34 cbor bytes of length 32) + (67 cbor bytes of length 64)
        // for a fixed length of 102
        BigInt( 102 ) * nVkeyWits * minFeeMultiplier +
        // we add some more bytes for the array tag
        BigInt( nVkeyWits < 24 ? 1 : (nVkeyWits < 256 ? 2 : 3) ) * minFeeMultiplier;

    const txOuts: TxOut[] = new Array( outs.length + 1 ); 
    outs.forEach( (txO,i) => txOuts[i] = txO.clone() );
    txOuts[txOuts.length - 1] = (
        new TxOut({
            address: changeAddress,
            value: Value.sub(
                totInputValue,
                Value.add(
                    requiredOutputValue,
                    Value.lovelaces( minFee )
                )
            )
        })
    );

    let tx = new Tx({
        ...dummyTx,
        body: {
            ...dummyTx.body,
            outputs: txOuts,
            fee: minFee
        }
    });

    return {
        tx,
        scriptsToExec,
        minFee,
        datumsScriptData,
        languageViews,
        totInputValue,
        requiredOutputValue,
        outs
    };
}

function getCtx(
    scriptType: ScriptType,
    spendingPurpose: DataConstr,
    txInfosV1: Data | undefined,
    txInfosV2: Data
): DataConstr
{
    if( scriptType === ScriptType.PlutusV2 )
    {
        return new DataConstr(
            0,
            [
                txInfosV2,
                spendingPurpose
            ]
        );
    }
    else if( scriptType === ScriptType.PlutusV1 )
    {
        if( txInfosV1 === undefined )
        throw new BasePlutsError(
            "plutus script v1 included in a v2 transaction"
        );

        return new DataConstr(
            0,
            [
                txInfosV1,
                spendingPurpose
            ]
        );
    }
    else throw new BasePlutsError(
        "unexpected native script execution"
    );
}

function onEvaluationResult(
    i: number,
    totExBudget: ExBudget,
    rdmr: TxRedeemer,
    result: UPLCTerm, 
    budgetSpent: ExBudget, 
    logs: string[],
    callArgs: Data[],
    rdmrs: TxRedeemer[],
    onScriptResult: ((rdmr: TxRedeemer, result: PureUPLCTerm, exBudget: ExBudget, logs: string[], callArgs: Data[]) => void) | undefined,
    onScriptInvalid: ((rdmr: TxRedeemer, logs: string[], callArgs: Data[]) => void) | undefined
): boolean
{
    let _isScriptValid = true;

    onScriptResult && onScriptResult(
        rdmr.clone(),
        result,
        budgetSpent.clone(),
        logs.slice(),
        callArgs.map( d => d.clone() )
    );

    if(
        result instanceof ErrorUPLC || 
        ((resultKeys) =>
            resultKeys.includes("msg") && 
            resultKeys.includes("addInfos")
        )(Object.keys( result ))
    )
    {
        if( typeof onScriptInvalid === "function" )
        {
            onScriptInvalid( rdmr.clone(), logs.slice(), callArgs.map( d => d.clone() ) );
            _isScriptValid = false;
        }
        else
        {
            throw new BasePlutsError(
                `script consumed with ${txRedeemerTagToString(rdmr.tag)} redemer ` +
                `and index '${rdmr.index.toString()}'\n\n` +
                `called with data arguments:\n${
                    callArgs
                    .map( (d, i) =>
                        (
                            i === 0 ? ( rdmr.tag === TxRedeemerTag.Spend ? "datum" : "redeemer" ) :
                            i === 1 ? ( rdmr.tag === TxRedeemerTag.Spend ? "redeemer" : "script context" ) :
                            i === 2 ? ( rdmr.tag === TxRedeemerTag.Spend ? "script context" : i.toString() ) :
                            i.toString()
                        ) + ": " + dataToCbor( d ).toString()
                    )
                    .join("\n")
                }\n\n` +
                `failed with \n`+
                `error message: ${(result as any).msg}\n`+ 
                `additional infos: ${
                    JSON.stringify(
                        (result as any).addInfos,
                        ( k, v ) => {
                            if( isUint8Array( v ) )
                            return toHex( v );

                            if( typeof v === "bigint" )
                            return v.toString();

                            return v
                        }
                    )
                }\n` +
                `script execution logs: [${logs.toString()}]\n`
            );
        }
    }

    rdmrs[i] = new TxRedeemer({
        ...rdmr,
        execUnits: budgetSpent
    });

    totExBudget.add( budgetSpent );

    return _isScriptValid;
};

export function getScriptDataHash( rdmrs: TxRedeemer[], datumsScriptData: number[], languageViews: Uint8Array ): ScriptDataHash | undefined
{
    const undef = void 0;

    const scriptData =
        rdmrs.length === 0 && datumsScriptData.length === 0 ?
        undef : 
        rdmrs.length === 0 && datumsScriptData.length > 0 ?
        /*
        ; in the case that a transaction includes datums but does not
        ; include any redeemers, the script data format becomes (in hex):
        ; [ 80 | datums | A0 ]
        ; corresponding to a CBOR empty list and an empty map.
        */
        [ 0x80, ...datumsScriptData, 0xa0 ] as byte[] :
        /*
        ; script data format:
        ; [ redeemers | datums | language views ]
        ; The redeemers are exactly the data present in the transaction witness set.
        ; Similarly for the datums, if present. If no datums are provided, the middle
        ; field is an empty string.
        */
        Array.from(
            Cbor.encode(
                new CborArray(
                    rdmrs.map( r => r.toCborObj() )
                )
            ).toBuffer()
        )
        .concat(
            datumsScriptData
        )
        .concat(
            Array.from(
                languageViews
            )
        ) as byte[];

    return scriptData === undef ? undef :
        new ScriptDataHash(
            Uint8Array.from(
                blake2b_256( scriptData )
            )
        );
}