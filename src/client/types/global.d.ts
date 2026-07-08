export {};

declare global {
  interface Window {
    __displayTitleWrapped?: boolean;
    __sarkartPreactDateFilter?: boolean;
    __updateProgressWrapped?: boolean;
    __chartPageWrapped?: boolean;
    DEBUG?: number;
  }
}
