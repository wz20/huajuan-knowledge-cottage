import {randomUUID} from 'node:crypto';
import type {Reminder} from '../shared/contracts';
/** Quiet intervals remain provisional until another input confirms a short reading pause. */
export class ActivityClock {
 private previousIdle:number|undefined;private quiet=0;
 reset(){this.previousIdle=undefined;this.quiet=0;}
 sample(delta:number,idle:number,paused:boolean){if(paused||delta<0||delta>5000||!Number.isFinite(idle)){this.reset();return 0;}if(this.previousIdle===undefined){this.previousIdle=idle;return 0;}const input=idle<this.previousIdle||idle<1;this.previousIdle=idle;if(input){const active=this.quiet<300000?this.quiet+delta:Math.min(delta,1000);this.quiet=0;return active;}this.quiet+=delta;return 0;}
}
export function advance(reminders:Reminder[],ms:number){for(const r of reminders){if(!r.enabled||r.phase!=='counting')continue;r.remainingMs=Math.max(0,r.remainingMs-ms);if(r.remainingMs===0){r.phase='due';r.episodeId=randomUUID();}}}
export function respond(reminders:Reminder[],kind:string,action:string,episodeId?:string){const r=reminders.find(r=>r.kind===kind);if(!r||(r.phase==='due'&&!episodeId)||episodeId&&r.episodeId!==episodeId)throw Error('INVALID_INPUT');if(action==='start_break'){if(kind!=='move'||r.phase==='break')throw Error('INVALID_INPUT');r.phase='break';r.episodeId??=randomUUID();}else if(action==='done'||action==='end_break'){if(action==='end_break'&&(kind!=='move'||r.phase!=='break')||action==='done'&&kind!=='drink')throw Error('INVALID_INPUT');r.phase='counting';r.remainingMs=r.intervalMs;delete r.episodeId;}else if(action==='snooze'){r.phase='counting';r.remainingMs=r.snoozeMs??600000;delete r.episodeId;}else throw Error('INVALID_INPUT');}

export function inSchedule(reminder:Reminder,date=new Date()){const schedule=reminder.schedule;if(!schedule?.enabled)return true;const minutes=(value:string)=>{const [h,m]=value.split(':').map(Number);return h*60+m;};const start=minutes(schedule.start),end=minutes(schedule.end),current=date.getHours()*60+date.getMinutes();return start===end||start<end?(start===end||current>=start&&current<end):(current>=start||current<end);}
/** Only expose a new in-memory state after its durable write succeeds. */
export async function commitReminderChange(current:Reminder[],change:(next:Reminder[])=>void,save:(next:Reminder[])=>Promise<unknown>){const next=structuredClone(current);change(next);await save(next);return next;}
