const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { order_id, driver_id, price, currency = 'USD', note = '' } = event

  if (!order_id || !driver_id || !price || Number(price) <= 0) {
    return {
      success: false,
      message: '参数错误'
    }
  }

  await db.collection('driver_quotes').add({
    data: {
      order_id,
      driver_id,
      price: Number(price),
      currency,
      note,
      quote_status: 'submitted',
      submitted_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  })

  return {
    success: true,
    message: '报价已提交'
  }
}