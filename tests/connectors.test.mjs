import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSource, sourceStatus, canPersist, summary } from '../lib/connectors/index.mjs';
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const common={id:'test-source',enabled:true,access_reference:'Test authorization'};
test('Commons discovery keeps only licensed metadata and never downloads images',async()=>{
  let calls=0;
  const result=await collectSource({...common,provider:'commons',category:'Category:Street fashion'},{env:{},fetchImpl:async url=>{
    calls++;assert.match(url,/commons.wikimedia.org\/w\/api.php/);
    return response({query:{pages:[
      {pageid:1,title:'File:Test.jpg',imageinfo:[{descriptionurl:'https://commons.wikimedia.org/wiki/File:Test.jpg',extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},Artist:{value:'<b>Example</b>'}}}]},
      {pageid:2,title:'File:Unknown.jpg',imageinfo:[{extmetadata:{LicenseShortName:{value:'Unknown'}}}]}
    ]}});
  }});
  assert.equal(calls,1);assert.equal(result.records.length,1);assert.equal(result.records[0].photographer,'Example');
  assert.equal(result.records[0].image_downloaded,false);assert.equal(result.records[0].geographic_claim,null);
});
test('no credentials or authorization means no provider request', async()=>{
  for(const provider of ['shopify','ebay','pinterest','instagram']){
    const result=await collectSource({...common,provider},{env:{},fetchImpl:()=>assert.fail('must not fetch')});
    assert.equal(result.state,'needs_setup'); assert.equal(result.records.length,0);
  }
});
test('Shopify authenticates correctly and keeps merchant image tied to listing',async()=>{
  const source={...common,provider:'shopify',auth_mode:'private',api_version:'2026-10'};
  const result=await collectSource(source,{env:{SHOPIFY_STORE_DOMAIN:'example.myshopify.com',SHOPIFY_STOREFRONT_TOKEN:'test-secret'},fetchImpl:async(url,options)=>{
    assert.equal(url,'https://example.myshopify.com/api/2026-10/graphql.json');
    assert.equal(options.headers['Shopify-Storefront-Private-Token'],'test-secret');
    return response({data:{products:{nodes:[{id:'p1',title:'Test pack',onlineStoreUrl:'https://example.org/pack',featuredImage:{url:'https://example.org/photo.jpg'},availableForSale:true}],pageInfo:{hasNextPage:true}}}});
  }});
  assert.equal(result.state,'connected'); assert.equal(result.partial,true);
  assert.equal(result.records[0].media[0].source_url,result.records[0].source_url);
  assert.equal(result.records[0].geographic_claim,null);
  assert.equal(JSON.stringify(summary(result)).includes('test-secret'),false);
});
test('eBay exchanges app credentials then reads Browse with marketplace, without persisting token',async()=>{
  const source={...common,provider:'ebay',environment:'sandbox',marketplace:'EBAY_US',query:'test shoe'};
  let calls=0;
  const result=await collectSource(source,{env:{EBAY_CLIENT_ID:'id',EBAY_CLIENT_SECRET:'secret'},fetchImpl:async(url,options)=>{
    calls++; if(calls===1){assert.match(url,/identity\/v1\/oauth2\/token$/);return response({access_token:'temporary-test-token'});}
    assert.match(url,/api.sandbox.ebay.com\/buy\/browse/);assert.equal(options.headers.Authorization,'Bearer temporary-test-token');
    return response({total:1,itemSummaries:[{itemId:'1',title:'Test shoe',itemWebUrl:'https://example.org/shoe',itemLocation:{country:'US',city:'Test City'}}]});
  }});
  assert.equal(calls,2); assert.equal(result.state,'connected');
  assert.equal(result.records[0].geographic_claim,null);assert.match(result.records[0].limitations.join(' '),/not buyer location/);
  assert.equal(JSON.stringify(result).includes('temporary-test-token'),false);
});
test('Pinterest normalizes relative interest without pretending it is city sales',async()=>{
  const result=await collectSource({...common,provider:'pinterest',trends_access_confirmed:true,region:'US',trend_type:'growing'},
    {env:{PINTEREST_ACCESS_TOKEN:'test'},fetchImpl:async()=>response({trends:[{keyword:'test fabric',pct_growth_wow:12,time_series:{'2025-01-05':42}}]})});
  assert.equal(result.state,'connected');assert.equal(result.records[0].weekly_relative_interest[0].value,42);assert.equal(result.records[0].geographic_claim,null);
});
test('Instagram reads only the participating professional account and requires consent',async()=>{
  const source={...common,provider:'instagram',account_access_confirmed:true,api_version:'v24.0',participant_consent_reference:'Test agreement',declared_city:'Test City'};
  const env={INSTAGRAM_ACCESS_TOKEN:'test-secret',INSTAGRAM_USER_ID:'1234'};
  assert.equal(sourceStatus({...source,participant_consent_reference:''},env).state,'needs_setup');
  const result=await collectSource(source,{env,fetchImpl:async(url,options)=>{
    assert.match(url,/graph.instagram.com\/v24.0\/1234\/media/);assert.equal(options.headers.Authorization,'Bearer test-secret');
    return response({data:[{id:'m1',media_type:'IMAGE',media_url:'https://example.org/image.jpg',permalink:'https://example.org/post'}]});
  }});
  assert.equal(result.state,'connected');assert.equal(result.records[0].geographic_basis,'participant_declared_unverified');
});
test('upstream errors are sanitized and retention is opt-in with an expiry',async()=>{
  const source={...common,provider:'pinterest',trends_access_confirmed:true,region:'US',trend_type:'growing'};
  const result=await collectSource(source,{env:{PINTEREST_ACCESS_TOKEN:'do-not-log'},fetchImpl:async()=>new Response('secret response',{status:403})});
  assert.equal(result.code,'access_denied');assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(canPersist(source),false);
  assert.equal(canPersist({...source,retention_approved:true,retention_reference:'Test grant',retention_days:30}),true);
});
