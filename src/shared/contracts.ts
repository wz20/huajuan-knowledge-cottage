export type PresentationTheme='auto'|'day'|'night';
export type SceneMode='work'|'leisure';
export type PresentationSettings={theme:PresentationTheme;musicVolume:number;mode:SceneMode};
export type ActivityKind='drink'|'move'|'catch'|'water';
export type ActivityCounts=Record<ActivityKind,number>;
export type ActivitySummary={generatedAt:number;dayStart:number;dayEnd:number;today:ActivityCounts;totals:ActivityCounts;unknownTime:ActivityCounts;fish:{species:string;count:number;unknownTimeCount:number}[]};
export type ActivityPage={items:{id:string;kind:ActivityKind;at:number|null;label:string}[];total:number;nextCursor:string|null};
export type Zone = 'overview'|'desk'|'library'|'balcony'|'lounge'|'pond'|'piano';
export type Todo = {id:string;title:string;completed:boolean};
export type Root = {id:string;path:string;name:string};
export type Entry = {id:string;name:string;kind:'dir'|'md';path:string};
export type Reminder = {kind:'drink'|'move';enabled:boolean;intervalMs:number;snoozeMs?:number;schedule?:{enabled:boolean;start:string;end:string};remainingMs:number;phase:'counting'|'due'|'break';episodeId?:string};
export type DirectoryStats={notes:number;directNotes:number;folders:number};
export type LibraryStats={totalNotes:number;totalFolders:number;counts:Record<string,DirectoryStats>;shelf:(Root & {rootId:string;parentId?:string;noteCount:number})[]};
export type Snapshot = PresentationSettings & {libraryStats?:LibraryStats;todos:Todo[];roots:Root[];recent:Entry[];reminders:Reminder[];plants:Record<string,number>;bestScore:number;catches:number;zone:Zone};
export type Result<T=unknown> = {ok:true;data:T}|{ok:false;error:{code:string;message:string}};
export type WorkbenchApi={invoke:{(action:'activity.summary'):Promise<Result<ActivitySummary>>;(action:string,payload?:any):Promise<Result<any>>};subscribe:(callback:(event:{type:string;data:any})=>void)=>()=>void};
declare global {interface Window {workbench:WorkbenchApi;__world?:any}}
