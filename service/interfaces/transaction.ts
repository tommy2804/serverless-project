export interface ITransaction {
  id: number;
  username: string;
  organization: string;
  tokens: number;
  ammount: number;
}

export interface ICreateTransactionDTO {
  username: string;
  organization: string;
  tokens: number;
  ammount: number;
}
