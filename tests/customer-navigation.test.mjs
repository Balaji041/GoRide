import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validCustomerOrigin,customerNavigationAllowed} from '../mobile/customerNavigation.mjs';
const origin='https://goride-south.nagendra80.chatgpt.site';
test('Customer account accepts its bookings and trusted sign-in destinations',()=>{
assert.equal(validCustomerOrigin(origin),true);
for(const url of [origin+'/account',origin+'/signout-with-chatgpt?return_to=%2Faccount','https://auth.openai.com/log-in','https://accounts.google.com/o/oauth2/auth','https://appleid.apple.com/auth/authorize'])assert.equal(customerNavigationAllowed(url,origin),true,url);
});
test('Customer account rejects unsafe configuration and misleading navigation destinations',()=>{
for(const url of ['http://example.com','file:///account','https://user:password@example.com','https://example.com/account','https://example.com?token=secret'])assert.equal(validCustomerOrigin(url),false,url);
for(const url of ['http://goride-south.nagendra80.chatgpt.site/account','javascript:alert(1)','data:text/html,<script></script>','file:///etc/passwd','intent://something','https://auth.openai.com.evil.test','https://auth.openai.com@evil.test','https://auth.openai.com:444/login','https://another.chatgpt.site/account'])assert.equal(customerNavigationAllowed(url,origin),false,url);
assert.equal(customerNavigationAllowed(origin+'/account','http://insecure.test'),false);
});


test('Customer account cannot navigate into admin pages or APIs',()=>{
for(const path of ['/admin','/admin/','/admin.html','/admin.js','/admin.css','/admin-customers.js','/api/admin/bookings','/%61dmin','/signin-with-chatgpt?return_to=%2Fadmin'])assert.equal(customerNavigationAllowed('https://goride.test'+path,'https://goride.test'),false,path);
});
