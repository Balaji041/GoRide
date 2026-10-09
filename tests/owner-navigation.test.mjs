import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validOwnerOrigin,ownerNavigationAllowed} from '../mobile/ownerNavigation.mjs';
const origin='https://goride-south.nagendra80.chatgpt.site';
test('Owner app accepts its dashboard and trusted sign-in destinations',()=>{
assert.equal(validOwnerOrigin(origin),true);
for(const url of [origin+'/admin',origin+'/signout-with-chatgpt?return_to=%2Fadmin','https://auth.openai.com/log-in','https://accounts.google.com/o/oauth2/auth','https://appleid.apple.com/auth/authorize'])assert.equal(ownerNavigationAllowed(url,origin),true,url);
});
test('Owner app rejects unsafe configuration and misleading navigation destinations',()=>{
for(const url of ['http://example.com','file:///admin','https://user:password@example.com','https://example.com/admin','https://example.com?token=secret'])assert.equal(validOwnerOrigin(url),false,url);
for(const url of ['http://goride-south.nagendra80.chatgpt.site/admin','javascript:alert(1)','data:text/html,<script></script>','file:///etc/passwd','intent://something','https://auth.openai.com.evil.test','https://auth.openai.com@evil.test','https://auth.openai.com:444/login','https://another.chatgpt.site/admin'])assert.equal(ownerNavigationAllowed(url,origin),false,url);
assert.equal(ownerNavigationAllowed(origin+'/admin','http://insecure.test'),false);
});
