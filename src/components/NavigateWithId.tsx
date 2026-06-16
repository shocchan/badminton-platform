import { useParams, Navigate } from 'react-router-dom';

const NavigateWithId: React.FC<{ to: string }> = ({ to }) => {
  const { id } = useParams();
  return <Navigate to={`${to}/${id}`} replace />;
};

export default NavigateWithId;
