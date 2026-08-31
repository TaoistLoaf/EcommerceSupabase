export const calculateRentalQuote = ({ days, dailyRate, productPrice }) => {
  const rentFee = days * dailyRate;
  const deposit = Math.max(productPrice - rentFee, 0);
  const totalPrice = rentFee >= productPrice ? rentFee : rentFee + deposit;

  return { days, rentFee, deposit, totalPrice };
};
