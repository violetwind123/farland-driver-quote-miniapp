{\rtf1\ansi\ansicpg1252\cocoartf2820
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # Farland Driver Quote Mini Program \'97 Project Context\
\
## 1. Project Overview\
\
This project is a WeChat Mini Program for Farland.\
\
Farland is a high-end custom travel and educational visit company focused on:\
\
- US school visits\
- airport transfers\
- charter services\
- multi-day transportation\
- educational tours\
- luxury ground transportation\
- driver-guide services\
\
This project is NOT a public ride-hailing platform like Uber or Didi.\
\
The goal is to build an INTERNAL:\
\
- driver quote system\
- operator dispatch system\
- transportation management workflow\
\
The system is designed to protect:\
\
- Farland supplier resources\
- driver relationships\
- customer pricing\
- internal margins\
\
Customers should NEVER see:\
- driver base prices\
- all driver quotes\
- internal margins\
- all drivers\
\
Drivers should NEVER see:\
- customer selling prices\
- internal notes\
- other driver quotes\
\
---\
\
# 2. Current MVP Goal\
\
Current phase focuses ONLY on:\
\
## Operator Flow\
\
Operator creates transportation request\
\uc0\u8594  sends quote invite link to drivers\
\uc0\u8594  drivers submit quotes\
\uc0\u8594  operator compares quotes\
\
## Driver Flow\
\
Driver receives WeChat link\
\uc0\u8594  opens Mini Program page\
\uc0\u8594  directly submits quote\
\
NO customer-side quotation system yet.\
\
NO payment.\
\
NO real-time tracking.\
\
NO public order marketplace.\
\
---\
\
# 3. Current Technical Stack\
\
## WeChat Mini Program\
\
Using:\
\
- WXML\
- WXSS\
- JS\
- JSON\
\
## CloudBase\
\
Using:\
\
- Cloud Database\
- Cloud Functions\
- Cloud Storage (future)\
\
## Repository Structure\
\
Project should use:\
\
text miniprogram/ cloudfunctions/ \
\
project.config.json must contain:\
\
json \{   "miniprogramRoot": "miniprogram/",   "cloudfunctionRoot": "cloudfunctions/" \} \
\
---\
\
# 4. Current Page Structure\
\
## Auth\
\
text pages/auth/login/login \
\
## Operator\
\
text pages/operator/dashboard/dashboard pages/operator/create-request/create-request pages/operator/request-detail/request-detail \
\
## Driver\
\
text pages/driver/quick-quote/quick-quote \
\
---\
\
# 5. Core Collections\
\
## users\
\
js \{   _id,   openid,   role, // admin/operator/driver   name,   phone,   status,   created_at,   updated_at,   last_login_at \} \
\
## ride_requests\
\
js \{   _id,   request_no,   service_type, // transfer / charter   service_subtype,   pickup_date,   pickup_time,   start_time,   end_time,   pickup_location,   dropoff_location,   stops,   itinerary_summary,   passengers,   luggage_count,   vehicle_requirement,   language_requirement,   special_requests,   quote_deadline,   status,   created_by,   created_at,   updated_at \} \
\
## quote_invites\
\
js \{   _id,   request_id,   token,   driver_name,   driver_phone,   status,   expires_at,   created_at \} \
\
## driver_quotes\
\
js \{   _id,   request_id,   invite_id,   token,   driver_name,   driver_phone,   quote_price,   currency,   quote_note,   price_type,   included_hours,   overtime_rate,   quote_status,   created_at,   updated_at \} \
\
---\
\
# 6. Current Cloud Functions\
\
## Existing\
\
### createQuoteInvite\
\
Generates quote invite token.\
\
### getQuoteInviteByToken\
\
Loads request data by token.\
\
Must ONLY return driver-visible information.\
\
Must NEVER expose:\
- customer selling price\
- internal notes\
- margins\
- other driver quotes\
\
### submitQuickQuote\
\
Submits or updates driver quote.\
\
---\
\
# 7. New Cloud Functions Needed\
\
## login\
\
Purpose:\
- get OPENID\
- query users\
- auto-login\
\
Logic:\
- if user exists \uc0\u8594  return user\
- if not \uc0\u8594  create driver user\
\
---\
\
## getOperatorRequests\
\
Purpose:\
- operator dashboard data\
\
Must:\
- verify role = operator/admin\
- return ride requests\
- include invite_count\
- include quote_count\
\
---\
\
## createRideRequest\
\
Purpose:\
- create transportation request\
\
Must:\
- verify operator/admin\
- generate request_no\
- insert into ride_requests\
- default status = quoting\
\
---\
\
## getRequestDetail\
\
Purpose:\
- operator request detail page\
\
Must return:\
- request\
- invites\
- quotes\
\
---\
\
# 8. Login Logic\
\
First launch:\
\
text Login Page \uc0\u8594  cloud function login \u8594  save user into storage \u8594  redirect by role \
\
Use:\
\
js wx.setStorageSync('farland_user', user) \
\
Second launch:\
\
js wx.getStorageSync('farland_user') \
\
If role = operator/admin:\
\uc0\u8594  enter dashboard directly\
\
If role = driver:\
\uc0\u8594  show reminder:\
"Please use quote invite link"\
\
IMPORTANT:\
Frontend cache is ONLY for UX.\
\
Actual permissions MUST always verify:\
- OPENID\
- users.role\
\
inside cloud functions.\
\
---\
\
# 9. Operator Dashboard Requirements\
\
Operator dashboard should show:\
\
- current transportation requests\
- quote counts\
- invite counts\
- statuses\
\
Floating "+" button:\
\uc0\u8594  create new request\
\
Each request item:\
\uc0\u8594  open request-detail\
\
---\
\
# 10. Create Request Requirements\
\
Two modes:\
\
## transfer\
\
Fields:\
- pickup_date\
- pickup_time\
- pickup_location\
- dropoff_location\
- stops\
- passengers\
- luggage_count\
- airport_transfer\
- flight_no\
- sign_required\
- quote_deadline\
\
## charter\
\
Fields:\
- pickup_date\
- start_time\
- end_time\
- estimated_hours\
- service_city\
- service_area\
- itinerary_summary\
- stops\
- passengers\
- luggage_count\
- quote_deadline\
\
---\
\
# 11. Quick Quote Page Requirements\
\
Quick Quote page should be EXTREMELY SIMPLE.\
\
Driver flow:\
\
Open link\
\uc0\u8594  load request by token\
\uc0\u8594  enter quote\
\uc0\u8594  submit\
\
The page MUST NOT include:\
- identity selection\
- operator login\
- operation code\
- driver registration\
- multi-step onboarding\
\
Only:\
- request display\
- quote form\
- submit button\
\
---\
\
# 12. Transfer Quote Fields\
\
For transfer:\
- quote_price\
- currency\
- quote_note\
\
---\
\
# 13. Charter Quote Fields\
\
For charter:\
- quote_price\
- currency\
- quote_note\
- price_type\
- included_hours\
- overtime_rate\
\
price_type options:\
- all_in\
- base_plus_extra\
\
---\
\
# 14. Security Requirements\
\
Must NEVER expose:\
- operator code in frontend\
- customer selling price\
- internal margins\
- all driver quotes\
- internal notes\
\
Cloud functions MUST validate:\
- OPENID\
- role\
\
Operator/admin only:\
- dashboard\
- create request\
- request detail\
\
Token pages:\
- quick quote only\
\
---\
\
# 15. Current Known Problems\
\
## Problem 1\
\
Old quick-quote page incorrectly included:\
- identity selection\
- operator code\
- driver registration\
\
These should be REMOVED.\
\
---\
\
## Problem 2\
\
Project structure previously mixed:\
- root app.json\
- miniprogram pages\
\
Need unified miniprogramRoot structure.\
\
---\
\
## Problem 3\
\
Dashboard/operator system not implemented yet.\
\
---\
\
# 16. Current Development Priority\
\
## P0\
\
1. Unified login\
2. Operator dashboard\
3. Create request page\
4. Request detail page\
5. Quick quote page simplification\
6. Quote invite workflow\
\
---\
\
# 17. Current Goal\
\
The current target is:\
\
Operator:\
Create request\
\uc0\u8594  generate quote links\
\uc0\u8594  send to drivers\
\uc0\u8594  collect quotes\
\
Driver:\
Open WeChat link\
\uc0\u8594  submit quote\
\
That is the ONLY required working MVP for now.}