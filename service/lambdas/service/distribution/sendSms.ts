// import { Handler } from 'aws-lambda';

// const sns = new SNS();

// interface MyEvent {
//   numbers: string[];
//   message: string;
// }

// export const handler: Handler<MyEvent> = async (event) => {
//   const { numbers, message } = event;

//   const params: AWS.SNS.PublishInput = {
//     Message: message,
//     PhoneNumber: numbers.join(','),
//   };

//   try {
//     const result = await sns.publish(params).promise();
//     console.log(result);
//     return {
//       statusCode: 200,
//       body: JSON.stringify(result),
//     };
//   } catch (err) {
//     console.error(err);
//     return {
//       statusCode: 500,
//       body: JSON.stringify(err),
//     };
//   }
// };
