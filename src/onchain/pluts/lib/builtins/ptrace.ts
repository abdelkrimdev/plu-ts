import { Builtin } from "../../../UPLC/UPLCTerms/Builtin";
import type { TermFn, PString } from "../../PTypes";
import { Term } from "../../Term";
import { TermType, ToPType, tyVar, fn, str, bool, delayed } from "../../type_system";
import { pdelay } from "../pdelay";
import { perror } from "../perror";
import { pfn } from "../pfn";
import { pforce } from "../pforce";
import { phoist } from "../phoist";
import { plam } from "../plam";
import { pBool } from "../std/bool/pBool";
import { addApplications } from "./addApplications";
import { pif } from "./bool";


export function ptrace<ReturnT extends TermType>( returnT: ReturnT )
    : TermFn<[ PString, ToPType<ReturnT> ], ToPType<ReturnT>>
{
    return addApplications<[ PString, ToPType<ReturnT> ], ToPType<ReturnT>>(
        new Term(
            fn([ str, returnT ], returnT )  as any,
            _dbn => Builtin.trace
        )
    );
}

export const ptraceIfTrue = phoist(
    pfn([
        str,
        bool,
    ],  bool)
    (( msg, boolean ) => 
        pif( bool ).$( boolean )
        .then( ptrace( bool ).$( msg ).$( pBool( true ) ) )
        .else( pBool( false ) )
    )
);

export const ptraceIfFalse = phoist(
    pfn([
        str,
        bool,
    ],  bool)
    (( msg, boolean ) => 
        pif( bool ).$( boolean )
        .then( pBool( true ) )
        .else( ptrace( bool ).$( msg ).$( pBool( false ) ) )
    )
);

export function ptraceError<T extends TermType>( t: T, somemsg?: string )
    : TermFn<[ PString ], ToPType<T>>
{
    return phoist(
        plam( str, t )
        ( msg => pforce(
            ptrace( delayed( t ) ).$( msg ).$( pdelay( perror( t, somemsg ) ) )
        ) as any )
    ) as any;
}