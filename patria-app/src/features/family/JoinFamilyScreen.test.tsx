import { fireEvent } from '@testing-library/react-native';

import { copy } from '../../lib/copy';
import { renderScreen } from '../../test/renderScreen';
import { JoinFamilyScreen } from './JoinFamilyScreen';

function mockedPush(): jest.Mock {
  const expoRouter = jest.requireMock('expo-router') as {
    useRouter: () => { push: jest.Mock };
  };
  return expoRouter.useRouter().push;
}

describe('JoinFamilyScreen', () => {
  beforeEach(() => {
    mockedPush().mockClear();
  });

  it('opens a pasted invite on the accept screen', () => {
    const { getByLabelText, getByText } = renderScreen(<JoinFamilyScreen />);

    expect(getByText(copy.home.joinFamily)).toBeTruthy();
    fireEvent.changeText(
      getByLabelText(copy.invite.pasteLabel),
      'patria://invite/abc123def456',
    );
    fireEvent.press(getByText(copy.invite.openLink));

    expect(mockedPush()).toHaveBeenCalledWith('/invite/abc123def456');
  });
});
