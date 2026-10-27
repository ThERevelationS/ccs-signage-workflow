import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/components/auth/EmailGate';
import {base44} from '@/api/base44Client';
import { staffEntities } from "@/components/staff/staffEntities";

export async function readExactLocalityForReview(id,entity=staffEntities.PermitLocality){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw Error('Saved locality reference is invalid.');
 let row;try{row=await entity.get(id);}catch{throw Error('This saved locality could not be read. Refresh coverage and try again.');}
 if(!row||row.id!==id)throw Error('Saved locality identity could not be confirmed. Refresh coverage and try again.');
 return row;
}
export default function useLocalityOfficeGapReview(readLocality=readExactLocalityForReview){
 const {currentUser,isRegistered}=useAuth();
 const owner=isRegistered&&currentUser?.role==='admin'?String(currentUser.id||currentUser.email||''):'';
 const ownerRef=useRef(owner),pending=useRef(null),loaded=useRef(null);
 ownerRef.current=owner;
 const [target,setTarget]=useState(null),[opening,setOpening]=useState(null),[failure,setFailure]=useState(null);
 useEffect(()=>{pending.current=null;loaded.current=null;setTarget(null);setOpening(null);setFailure(null);},[owner]);
 useEffect(()=>()=>{pending.current=null;ownerRef.current='';},[]);
 async function open(id){
  if(!owner||pending.current||loaded.current)return;
  const attempt={owner,id};pending.current=attempt;setOpening(attempt);setFailure(null);
  const current=()=>pending.current===attempt&&ownerRef.current===owner;
  try{
   const locality=await readLocality(id);
   if(current()){loaded.current={owner,locality};setTarget(loaded.current);}
  }catch(error){if(current())setFailure({owner,message:error?.message||'Locality review could not be opened.'});}
  finally{if(current()){pending.current=null;setOpening(null);}}
 }
 function close(){pending.current=null;loaded.current=null;setTarget(null);setOpening(null);}
 return {canReview:Boolean(owner),record:target?.owner===owner?target.locality:null,
  openingId:opening?.owner===owner?opening.id:null,error:failure?.owner===owner?failure.message:'',open,close};
}