# DATABASE

## users
```js
{
  _id,
  openid,
  role,
  name,
  phone,
  status,
  driver_id,
  created_at,
  updated_at,
  last_login_at
}
```

## drivers
```js
{
  _id,
  user_id,
  openid,
  name,
  phone,
  service_region,
  status,
  default_vehicle_id,
  created_at,
  updated_at
}
```

## vehicles
```js
{
  _id,
  driver_id,
  vehicle_type,
  vehicle_model,
  seats,
  luggage_capacity,
  plate_number,
  status,
  created_at,
  updated_at
}
```

## ride_requests
```js
{
  _id,
  request_no,
  service_type,
  service_date,
  driver_region,
  task_description,
  quote_deadline,
  internal_note,
  status,
  created_by,
  created_at,
  updated_at
}
```

## quote_invites
```js
{
  _id,
  request_id,
  token,
  driver_region,
  status,
  expires_at,
  created_by,
  created_at,
  updated_at
}
```

## driver_quotes
```js
{
  _id,
  request_id,
  token,
  user_id,
  driver_id,
  vehicle_id,
  driver_name_snapshot,
  driver_phone_snapshot,
  vehicle_type_snapshot,
  vehicle_model_snapshot,
  seats_snapshot,
  luggage_capacity_snapshot,
  quote_price,
  currency,
  quote_note,
  quote_status,
  submitted_at,
  updated_at
}
```
