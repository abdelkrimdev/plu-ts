import { BasePlutsError } from "../../../errors/BasePlutsError";
import { ConstType, constT } from "../../UPLC/UPLCTerms/UPLCConst/ConstType";
import { PrimType, TermType } from "./types";
import { unwrapAlias } from "./tyArgs/unwrapAlias";

export function termTyToConstTy( t: TermType ): ConstType
{
    switch( t[0] )
    {
        case PrimType.Alias:    return termTyToConstTy( unwrapAlias( t as any ) );
        case PrimType.Unit:     return constT.unit;
        case PrimType.Int:      return constT.int;
        case PrimType.BS:       return constT.byteStr;
        case PrimType.Bool:     return constT.bool;
        case PrimType.Str:      return constT.str;
        case PrimType.Struct:
        case PrimType.Data:
        case PrimType.AsData:   return constT.data; 
        case PrimType.List:     return constT.listOf( termTyToConstTy( t[1] ) );
        case PrimType.Pair:     return constT.pairOf( termTyToConstTy( t[1] ), termTyToConstTy( t[2] ) )

        case PrimType.Delayed:
        case PrimType.Lambda:
        default:
            throw new BasePlutsError("unable to convert term type to uplc constant type")
    }
}