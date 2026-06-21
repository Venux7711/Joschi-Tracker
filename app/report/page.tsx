﻿﻿useclient

import{useState,useEffect,useRef}fromreact
importLinkfromnext/link
importHeaderfrom@/components/Header
import{createClient}from@/lib/supabase/client

interfaceHealthLog{logged_at:string;stool_consistency:string;appetite:string;activity:string;vomiting:boolean;fur_issue:boolean;notes:string|null}
interfaceFeedingLog{logged_at:string;food_brand:string;food_type:string;amount_grams:number|null}

constSTOOL:Record<string,string>={normal:Normal,soft:Weich,diarrhea:Durchfallï¸,not_observed:}
constAPPETITE:Record<string,string>={good:Gut,reduced:Wenig,none:Garnicht}

exportdefaultfunctionReportPage(){
constsupabase=createClient()
constreportRef=useRef<HTMLDivElement>(null)

const[days,setDays]=useState(30)
const[health,setHealth]=useState<HealthLog[]>([])
const[feedings,setFeedings]=useState<FeedingLog[]>([])
const[loading,setLoading]=useState(true)
const[catName,setCatName]=useState(Joschi)

useEffect(()=>{load()},[days])

constload=async()=>{
setLoading(true)
const{data:cats}=awaitsupabase.from(cats).select(id,name).limit(1)
constcat=cats?.[0]
if(!cat){setLoading(false);return}
if(cat.name)setCatName(cat.name)

constsince=newDate()
since.setDate(since.getDate()-days)
constsinceStr=since.toISOString()

const[hRes,fRes]=awaitPromise.all([
supabase.from(health_logs).select(*).eq(cat_id,cat.id).gte(logged_at,sinceStr).order(logged_at,{ascending:true}),
supabase.from(feeding_logs).select(*).eq(cat_id,cat.id).gte(logged_at,sinceStr).order(logged_at,{ascending:true}),
])

setHealth(hRes.data??[])
setFeedings(fRes.data??[])
setLoading(false)
}

consthandlePrint=()=>window.print()

//Stats
constdiarrheaDays=newSet(health.filter(h=>h.stool_consistency===diarrhea).map(h=>h.logged_at.slice(0,10))).size
constgoodDays=days-diarrheaDays
constvomitingCount=health.filter(h=>h.vomiting).length
constfurCount=health.filter(h=>h.fur_issue).length

constfoodCounts:Record<string,number>={}
feedings.forEach(f=>{if(f.food_type)foodCounts[f.food_type]=(foodCounts[f.food_type]??0)+1})
consttopFoods=Object.entries(foodCounts).sort((a,b)=>b[1]-a[1]).slice(0,5)

consttoday=newDate().toLocaleDateString(de-DE,{day:numeric,month:long,year:numeric})
constsince=newDate();since.setDate(since.getDate()-days)
constsinceStr=since.toLocaleDateString(de-DE,{day:numeric,month:long,year:numeric})

//Grouphealthbyweekforminichart
constweekBars:{label:string;good:number;bad:number}[]=[]
for(letw=Math.ceil(days/7)-1;w>=0;w--){
constwStart=newDate();wStart.setDate(wStart.getDate()-(w+1)*7)
constwEnd=newDate();wEnd.setDate(wEnd.getDate()-w*7)
constwLogs=health.filter(h=>{constd=newDate(h.logged_at);returnd>=wStart&&d<wEnd})
constbad=wLogs.filter(h=>h.stool_consistency===diarrhea).length
weekBars.push({label:`KW${Math.ceil((wEnd.getTime()-newDate(wEnd.getFullYear(),0,1).getTime())/604800000)}`,good:7-bad,bad})
}

return(
<divclassName="min-h-screen">
<Header/>
<mainclassName="max-w-2xlmx-autopx-4py-6">
<divclassName="flexitems-centerjustify-betweenmb-6">
<divclassName="flexitems-centergap-3">
<Linkhref="/dashboard"className="text-gray-400hover:text-gray-600">†Zurück</Link>
<h1className="text-xlfont-boldtext-gray-800">ðŸ¥Tierarzt-Report</h1>
</div>
<buttononClick={handlePrint}className="btn-primarytext-sm">Drucken/PDF</button>
</div>

{/*Zeitraum*/}
<divclassName="flexgap-2mb-5">
{[14,30,60,90].map(d=>(
<buttonkey={d}onClick={()=>setDays(d)}className={`flex-1py-2rounded-xltext-smfont-mediumtransition-colorsborder${days===d?bg-amber-500text-whiteborder-amber-500:bg-whitetext-gray-600border-gray-200hover:border-amber-300}`}>
{d}Tage
</button>
))}
</div>

{loading?(
<divclassName="cardp-8text-centertext-gray-400">LadeDaten</div>
):(
<divref={reportRef}className="space-y-4print:space-y-6">

{/*Header*/}
<divclassName="cardp-5print:borderprint:border-gray-300">
<divclassName="flexitems-startjustify-between">
<div>
<h2className="text-2xlfont-blacktext-gray-800">{catName}Gesundheitsbericht</h2>
<pclassName="text-gray-500text-smmt-1">Zeitraum:{sinceStr}{today}</p>
<pclassName="text-gray-400text-xsmt-0.5">Rasse:GoldeneLanghaar-Perser·Erkrankung:RezidivierenderDurchfall</p>
</div>
<divclassName="text-4xl">ðŸ±</div>
</div>
</div>

{/*Zusammenfassung*/}
<divclassName="cardp-5">
<h3className="font-boldtext-gray-800mb-4">Zusammenfassung({days}Tage)</h3>
<divclassName="gridgrid-cols-2gap-3">
<divclassName="bg-green-50rounded-xlp-3text-center">
<divclassName="text-3xlfont-blacktext-green-600">{goodDays}</div>
<divclassName="text-xstext-green-700font-medium">GuteTage</div>
</div>
<divclassName="bg-red-50rounded-xlp-3text-center">
<divclassName="text-3xlfont-blacktext-red-500">{diarrheaDays}</div>
<divclassName="text-xstext-red-700font-medium">Durchfall-Tage</div>
</div>
<divclassName="bg-orange-50rounded-xlp-3text-center">
<divclassName="text-3xlfont-blacktext-orange-500">{vomitingCount}</div>
<divclassName="text-xstext-orange-700font-medium">Malerbrochen</div>
</div>
<divclassName="bg-amber-50rounded-xlp-3text-center">
<divclassName="text-3xlfont-blacktext-amber-600">{feedings.length}</div>
<divclassName="text-xstext-amber-700font-medium">Fütterungen</div>
</div>
</div>
{furCount>0&&(
<divclassName="mt-3bg-orange-50rounded-xlp-3text-center">
<spanclassName="text-smtext-orange-700font-medium">ï¸KotimFell:{furCount}aufgetreten</span>
</div>
)}
</div>

{/*Mini-Chart*/}
{weekBars.length>0&&(
<divclassName="cardp-5">
<h3className="font-boldtext-gray-800mb-4">VerlaufnachWoche</h3>
<divclassName="flexitems-endgap-2h-20">
{weekBars.map((bar,i)=>{
consttotal=bar.good+bar.bad||7
constbadPct=(bar.bad/total)*100
constgoodPct=(bar.good/total)*100
return(
<divkey={i}className="flex-1flexflex-colitems-centergap-1">
<divclassName="w-fullflexflex-coljustify-end"style={{height:60}}>
{bar.bad>0&&<divclassName="w-fullrounded-t"style={{height:`${badPct}%`,background:#ef4444}}/>}
{bar.good>0&&<divclassName={`w-full${bar.bad===0?rounded:rounded-b}`}style={{height:`${goodPct}%`,background:#22c55e}}/>}
</div>
<spanclassName="text-[9px]text-gray-400">{bar.label}</span>
</div>
)
})}
</div>
<divclassName="flexgap-4mt-2text-xs">
<spanclassName="flexitems-centergap-1"><spanclassName="w-2h-2rounded-fullbg-green-500inline-block"/>Gut</span>
<spanclassName="flexitems-centergap-1"><spanclassName="w-2h-2rounded-fullbg-red-500inline-block"/>Durchfall</span>
</div>
</div>
)}

{/*Futter*/}
{topFoods.length>0&&(
<divclassName="cardp-5">
<h3className="font-boldtext-gray-800mb-3">VerabreichtesFutter(Top5)</h3>
<divclassName="space-y-2">
{topFoods.map(([food,count])=>(
<divkey={food}className="flexitems-centergap-3">
<divclassName="flex-1min-w-0">
<pclassName="text-smfont-mediumtext-gray-700truncate">{food}</p>
</div>
<divclassName="flexitems-centergap-2">
<divclassName="w-16bg-gray-100rounded-fullh-2">
<divclassName="bg-amber-400h-2rounded-full"style={{width:`${(count/(topFoods[0]?.[1]??1))*100}%`}}/>
</div>
<spanclassName="text-smtext-gray-500w-8text-right">{count}</span>
</div>
</div>
))}
</div>
</div>
)}

{/*Tabellarischebersicht*/}
<divclassName="cardp-5">
<h3className="font-boldtext-gray-800mb-3">Tagesübersicht(Befinden)</h3>
{health.length===0?(
<pclassName="text-gray-400text-sm">KeineBefinden-EinträgeimZeitraum.</p>
):(
<divclassName="overflow-x-auto">
<tableclassName="w-fulltext-sm">
<thead>
<trclassName="text-lefttext-xstext-gray-500border-bborder-gray-100">
<thclassName="pb-2font-medium">Datum</th>
<thclassName="pb-2font-medium">Stuhl</th>
<thclassName="pb-2font-medium">Appetit</th>
<thclassName="pb-2font-medium">Notiz</th>
</tr>
</thead>
<tbody>
{health.slice(-30).map(h=>(
<trkey={h.logged_at}className={`border-bborder-gray-50${h.stool_consistency===diarrhea?bg-red-50:}`}>
<tdclassName="py-1.5text-gray-600text-xs">{newDate(h.logged_at).toLocaleDateString(de-DE,{day:2-digit,month:2-digit})}</td>
<tdclassName={`py-1.5font-mediumtext-xs${h.stool_consistency===diarrhea?text-red-600:text-gray-700}`}>{STOOL[h.stool_consistency]??h.stool_consistency}</td>
<tdclassName="py-1.5text-gray-600text-xs">{APPETITE[h.appetite]??h.appetite}</td>
<tdclassName="py-1.5text-gray-400text-xstruncatemax-w-[120px]">{h.notes??(h.vomiting?Erbrochen:)}</td>
</tr>
))}
</tbody>
</table>
</div>
)}
</div>

<pclassName="text-xstext-gray-400text-centerpb-4">ErstelltmitJoschiTracker·{today}</p>
</div>
)}
</main>

<style>{`
@mediaprint{
.sm\\:hidden{display:none!important;}
header{display:none!important;}
nav{display:none!important;}
body{background:white!important;padding:0!important;}
.card{box-shadow:none!important;border:1pxsolid#e5e7eb!important;}
button{display:none!important;}
}
`}</style>
</div>
)
}
