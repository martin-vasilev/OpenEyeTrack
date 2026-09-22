type InitMessage={type:"init";readable:ReadableStream<VideoFrame>;maxQueue:number};
type RequestMessage={type:"next"};
type StopMessage={type:"stop"};
let queue:VideoFrame[]=[];let waiting=false;let stopped=false;let captured=0,dropped=0;let maxQueue=8;
function sendNext(){
  if(!waiting||!queue.length)return;
  waiting=false;
  const frame=queue.shift()!;
  (self as DedicatedWorkerGlobalScope).postMessage({type:"frame",frame,captured,dropped,queueDepth:queue.length},[frame]);
}
async function consume(readable:ReadableStream<VideoFrame>){
  const reader=readable.getReader();
  try{
    while(!stopped){
      const {value,done}=await reader.read();if(done)break;
      captured++;
      if(queue.length>=maxQueue){queue.shift()?.close();dropped++;}
      queue.push(value);sendNext();
    }
  }finally{reader.releaseLock();}
}
self.onmessage=(event:MessageEvent<InitMessage|RequestMessage|StopMessage>)=>{
  const msg=event.data;
  if(msg.type==="init"){maxQueue=Math.max(2,msg.maxQueue);void consume(msg.readable);}
  else if(msg.type==="next"){waiting=true;sendNext();}
  else if(msg.type==="stop"){stopped=true;for(const f of queue)f.close();queue=[];}
};