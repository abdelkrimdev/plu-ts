import JsRuntime from "../../../utils/JsRuntime";

import { UPLCTerm } from "../../UPLC/UPLCTerm";
import { CEKEnv } from "../CEKEnv";
import { CEKValue } from "../CEKValue";

export class ComputeStep
{
    private _term: UPLCTerm;
    get term(): UPLCTerm
    { return this._term; }  
    
    private _env: CEKEnv;
    get env(): CEKEnv
    { return this._env; }  

    constructor( term: UPLCTerm, env: CEKEnv )
    {
        this._term = term;
        this._env = env;
    }
}
export class ReturnStep
{
    private _value: CEKValue;
    get value(): CEKValue { return this._value; }

    constructor( value: CEKValue )
    {
        this._value = value;
    }
}

export type CEKStep = ComputeStep | ReturnStep;

export class CEKSteps
{
    private _steps: CEKStep[]

    constructor()
    {
        this._steps = []
    }

    push( step: CEKStep )
    {
        this._steps.push( step );
    }

    pop()
    {
        return this._steps.pop();
    }

    top(): Readonly<CEKStep> | undefined
    {
        if( this._steps.length === 0 ) return undefined;
        return JsRuntime.objWithUnderscoreAsPrivate( this._steps[ this._steps.length - 1 ] );
    }

    get topIsReturn(): boolean
    {
        return this._steps[ this._steps.length - 1 ] instanceof ReturnStep;
    }
    get topIsCompute(): boolean
    {
        return this._steps[ this._steps.length - 1 ] instanceof ComputeStep;
    }
}